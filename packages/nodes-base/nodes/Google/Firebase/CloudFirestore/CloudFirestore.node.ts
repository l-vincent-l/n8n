import {
	IExecuteFunctions,
} from 'n8n-core';

import {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import {
	documentToJson,
	googleApiRequest,
	googleApiRequestAllItems,
	jsonToDocument
} from './GenericFunctions';

import {
	collectionFields,
	collectionOperations,
} from './CollectionDescription';

import {
	documentFields,
	documentOperations,
} from './DocumentDescription';

export class CloudFirestore implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Google Firebase Cloud Firestore',
		name: 'googleFirebaseCloudFirestore',
		icon: 'file:googleFirebaseCloudFirestore.png',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Interact with Google Firebase - Cloud Firestore API',
		defaults: {
			name: 'Google Cloud Firestore',
			color: '#ffcb2d',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'googleFirebaseCloudFirestoreOAuth2Api',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'Document',
						value: 'document',
					},
					{
						name: 'Collection',
						value: 'collection',
					},
				],
				default: 'document',
				description: 'The resource to operate on.',
			},
			...documentOperations,
			...documentFields,
			...collectionOperations,
			...collectionFields,
		],
	};

	methods = {
		loadOptions: {
			async getProjects(
				this: ILoadOptionsFunctions,
			): Promise<INodePropertyOptions[]> {
				const collections = await googleApiRequestAllItems.call(
					this,
					'results',
					'GET',
					'',
					{},
					{},
					'https://firebase.googleapis.com/v1beta1/projects',
				);
				// @ts-ignore
				const returnData = collections.map(o => ({ name: o.projectId, value: o.projectId })) as INodePropertyOptions[];
				return returnData;
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {

		const items = this.getInputData();
		const returnData: IDataObject[] = [];
		let responseData;
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		
		if (resource === 'document') {
			if (operation === 'get') {
				const projectId = this.getNodeParameter('projectId', 0) as string;
				const database = this.getNodeParameter('database', 0) as string;
				const simple = this.getNodeParameter('simple', 0) as boolean;
				const documentList = items.map((item: IDataObject, i: number) => {
					const collection = this.getNodeParameter('collection', i) as string;
					const documentId = this.getNodeParameter('documentId', i) as string;
					return `projects/${projectId}/databases/${database}/documents/${collection}/${documentId}`;
				});
				
				responseData = await googleApiRequest.call(
					this,
					'POST',
					`/${projectId}/databases/${database}/documents:batchGet`,
					{ documents: documentList },
				);
				
				if (simple === false) {
					returnData.push.apply(returnData, responseData as IDataObject[]);
				} else {
					// @ts-ignore
					returnData.push.apply(returnData, responseData.map((el: IDataObject) => documentToJson(el.found.fields as IDataObject)) as IDataObject[]);
				}
			} else if (operation === 'create') {
				const projectId = this.getNodeParameter('projectId', 0) as string;
				const database = this.getNodeParameter('database', 0) as string;
				const simple = this.getNodeParameter('simple', 0) as boolean;

				await Promise.all(items.map(async (item: IDataObject, i: number) => {
					const collection = this.getNodeParameter('collection', i) as string;
					const columns = this.getNodeParameter('columns', i) as string;
					const columnList = columns.split(',').map(column => column.trim());
					const document = {fields: {}};
					columnList.map(column => {
						// @ts-ignore
						document.fields[column] = item['json'][column] ? jsonToDocument(item['json'][column]) : jsonToDocument(null);
					});
					responseData = await googleApiRequest.call(
						this,
						'POST',
						`/${projectId}/databases/${database}/documents/${collection}`,
						document,
					);
					if (simple === false) {
						returnData.push(responseData);
					} else {
						returnData.push(documentToJson(responseData.fields as IDataObject));
					}
				}));
			} else if (operation === 'getAll') {
				const projectId = this.getNodeParameter('projectId', 0) as string;
				const database = this.getNodeParameter('database', 0) as string;
				const collection = this.getNodeParameter('collection', 0) as string;
				const returnAll = this.getNodeParameter('returnAll', 0) as string;
				const simple = this.getNodeParameter('simple', 0) as boolean;

				if (returnAll) {
					responseData = await googleApiRequestAllItems.call(
						this,
						'documents',
						'GET',
						`/${projectId}/databases/${database}/documents/${collection}`,
					);
				} else {
					const limit = this.getNodeParameter('limit', 0) as string;
					const getAllResponse = await googleApiRequest.call(
						this,
						'GET',
						`/${projectId}/databases/${database}/documents/${collection}`,
						{},
						{ pageSize: limit },
					) as IDataObject;
					responseData = getAllResponse.documents;
				}
				if (simple === false) {
					returnData.push.apply(returnData, responseData);
				} else {
					returnData.push.apply(returnData, responseData.map((element: IDataObject) => documentToJson(element.fields as IDataObject)));
				}
			} else if (operation === 'delete') {
				const responseData: IDataObject[] = [];

				await Promise.all(items.map(async (item: IDataObject, i: number) => {
					const projectId = this.getNodeParameter('projectId', i) as string;
					const database = this.getNodeParameter('database', i) as string;
					const collection = this.getNodeParameter('collection', i) as string;
					const documentId = this.getNodeParameter('documentId', i) as string;

					await googleApiRequest.call(
						this,
						'DELETE',
						`/${projectId}/databases/${database}/documents/${collection}/${documentId}`,
					);

					responseData.push({ success: true });
					
				}));
				returnData.push.apply(returnData, responseData);

			} else if (operation === 'upsert') {
				const projectId = this.getNodeParameter('projectId', 0) as string;
				const database = this.getNodeParameter('database', 0) as string;

				const updates = items.map((item: IDataObject, i: number) => {
					const collection = this.getNodeParameter('collection', i) as string;
					const updateKey = this.getNodeParameter('updateKey', i) as string;
					// @ts-ignore
					const documentId = item['json'][updateKey] as string;
					const columns = this.getNodeParameter('columns', i) as string;
					const columnList = columns.split(',').map(column => column.trim()) as string[];
					const document = {};
					columnList.map(column => {
						// @ts-ignore
						document[column] = item['json'].hasOwnProperty(column) ? jsonToDocument(item['json'][column]) : jsonToDocument(null);
					});

					return {
						update: {
							name: `projects/${projectId}/databases/${database}/documents/${collection}/${documentId}`,
							fields: document,
						},
						updateMask: {
							fieldPaths: columnList,
						},
					};

				});

				responseData = [];

				const { writeResults, status } = await googleApiRequest.call(
					this,
					'POST',
					`/${projectId}/databases/${database}/documents:batchWrite`,
					{ writes: updates },
				);

				for (let i = 0; i < writeResults.length; i++) {
					writeResults[i]['status'] = status[i];
					Object.assign(writeResults[i], items[i].json);
					responseData.push(writeResults[i]);
				}

				returnData.push.apply(returnData, responseData);

			// } else if (operation === 'update') {
			// 	const projectId = this.getNodeParameter('projectId', 0) as string;
			// 	const database = this.getNodeParameter('database', 0) as string;
			// 	const simple = this.getNodeParameter('simple', 0) as boolean;

			// 	await Promise.all(items.map(async (item: IDataObject, i: number) => {
			// 		const collection = this.getNodeParameter('collection', i) as string;
			// 		const updateKey = this.getNodeParameter('updateKey', i) as string;
			// 		// @ts-ignore
			// 		const documentId = item['json'][updateKey] as string;
			// 		const columns = this.getNodeParameter('columns', i) as string;
			// 		const columnList = columns.split(',').map(column => column.trim()) as string[];
			// 		const document = {};
			// 		columnList.map(column => {
			// 			// @ts-ignore
			// 			document[column] = item['json'].hasOwnProperty(column) ? jsonToDocument(item['json'][column]) : jsonToDocument(null);
			// 		});
			// 		responseData = await googleApiRequest.call(
			// 			this,
			// 			'PATCH',
			// 			`/${projectId}/databases/${database}/documents/${collection}/${documentId}`,
			// 			{ fields: document },
			// 			{ [`updateMask.fieldPaths`]: columnList },
			// 		);
			// 		if (simple === false) {
			// 			returnData.push(responseData);
			// 		} else {
			// 			returnData.push(documentToJson(responseData.fields as IDataObject));
			// 		}
			// 	}));
		
			} else if (operation === 'query') {
				const projectId = this.getNodeParameter('projectId', 0) as string;
				const database = this.getNodeParameter('database', 0) as string;
				const simple = this.getNodeParameter('simple', 0) as boolean;
				

				await Promise.all(items.map(async (item: IDataObject, i: number) => {
					const query = this.getNodeParameter('query', i) as string;
					responseData = await googleApiRequest.call(
						this,
						'POST',
						`/${projectId}/databases/${database}/documents:runQuery`,
						JSON.parse(query),
					);
					if (simple === false) {
						returnData.push.apply(returnData, responseData);
					} else {
						//@ts-ignore
						returnData.push.apply(returnData, responseData.map((el: IDataObject) => documentToJson(el.document.fields as IDataObject)));
					}
				}));
			}
		} else if (resource === 'collection') {
			if (operation === 'getAll') {
				const projectId = this.getNodeParameter('projectId', 0) as string;
				const database = this.getNodeParameter('database', 0) as string;
				const returnAll = this.getNodeParameter('returnAll', 0) as string;

				if (returnAll) {
					const getAllResponse = await googleApiRequestAllItems.call(
						this,
						'collectionIds',
						'POST',
						`/${projectId}/databases/${database}/documents:listCollectionIds`,
					);
					// @ts-ignore
					responseData = getAllResponse.map(o => ({name: o}));
				} else {
					const limit = this.getNodeParameter('limit', 0) as string;
					const getAllResponse = await googleApiRequest.call(
						this,
						'POST',
						`/${projectId}/databases/${database}/documents:listCollectionIds`,
						{},
						{ pageSize: limit },
					) as IDataObject;
					// @ts-ignore
					responseData = getAllResponse.collectionIds.map(o => ({name: o}));
				}
				returnData.push.apply(returnData, responseData);
			}
		}

		return [this.helpers.returnJsonArray(returnData)];
	}
}