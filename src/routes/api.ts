import express = require('express');
const router = express.Router();
var bodyParser = require('body-parser')
//import { ExecuteDecisionTable, ExecuteCondition, ExecuteExpression } from 'dmn-engine';

const FS = require('fs');

import { BPMNServer, dateDiff, Behaviour_names, CacheManager   } from '..';

//const bpmnServer = new BPMNServer(config);

//const definitions = bpmnServer.definitions;

var caseId = Math.floor(Math.random() * 10000);

/* GET users listing. */


    const awaitAppDelegateFactory = (middleware) => {
    return async (req, res, next) => {
        try {
            await middleware(req, res, next)
        } catch (err) {
            next(err)
        }
    }
}

function loggedIn(req, res, next) {

    let apiKey = req.header('x-api-key');

    if (!apiKey) {
        apiKey= req.query.apiKey;
    }

    if (apiKey == process.env.API_KEY) {  
        next();
    } else {
        res.json({ errors: 'missing or invalid "x-api-key"'});
    }
}
import { Common } from './common';
import { ViewHelper } from './ViewHelper';

export class API extends Common {
    get bpmnServer() { return this.webApp.bpmnServer; }
    config() {

        var router = express.Router();
        var bpmnServer = this.bpmnServer;

        router.get('/status', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            let status;
            let errors;
            try {
                status = await this.bpmnServer.status();
            }
            catch (exc) {
                errors = exc.toString();
                //console.log(errors);
            }
            response.json({ errors: errors, status });
        }));

        router.get('/datastore/findItems', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            //console.log(request.body);
            let query;
            if (request.body.query) {
                query = request.body.query;
            }
            else
                query = request.body;

            //console.log(query);
            let items;
            let errors;
            try {
                items = await this.bpmnServer.dataStore.findItems(query);
            }
            catch (exc) {
                errors = exc.toString();
                //console.log(errors);
            }
            response.json({ errors: errors, items });
        }));
        //option: 'summary' | 'full' | any = 'summary'

        router.post('/query', async (req, res) => {
            try {
                const query = req.body.query;
                console.log(query);
                //const collection = db.collection(collectionName);
                var results = await this.bpmnServer.dataStore.findInstances(query,{
                    projections:    {name:1,status:1,data:1,
                        items:{elementId:1,seq:1,type:1,status:1} },
                        sort:{saved:-1}}).toArray();
                        console.log(results.length);
                        res.json(results);
                        console.log(results.length);
            } catch (error) {
                res.status(500).send(error);
            }
        });
        router.get('/datastore/findInstances', loggedIn, awaitAppDelegateFactory(async (request, response) => {


            //console.log(request.body);
            let query,projection='full';
            if (request.body.query) {
                query = request.body.query;
            }
            else
                query = request.body;

            if (request.body.projection)
                projection=request.body.projection;

            let instances;
            let errors;
            try {

                instances = await this.bpmnServer.dataStore.findInstances(query,projection);
            }
            catch (exc) {
                errors = exc.toString();
                console.log(errors);
            }
            response.json({ errors: errors, instances });
        }));
        router.get('/datastore/find', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            let error, results = null;
            let {
                filter = {}, // filter object to match documents.   // e.g. { status: 'running' }
                projection = { name: 1, status: 1, data: 1, items: { elementId: 1, seq: 1, type: 1, status: 1 } }, // projection object to specify fields to return
                after,
                limit = 10,
                sort = { '_id': -1 }, // default sort by _id (descending)'},
                lastItem={},
                latestItem={},
                getTotalCount = false
              } = request.body;

              limit=Number.parseInt(limit); // ensure limit is a number
            
            try {

                results = await this.bpmnServer.dataStore.find({ filter, projection, after, limit, sort,lastItem,latestItem,getTotalCount});
                
            }
            catch (exc) {
                error = exc.toString();
                console.log(error);
                response.error=error;
            }
            response.json(results);
        }));
        router.get('/data/fieldInfo', loggedIn, awaitAppDelegateFactory(async (request, response) => {
    
                let id = request.query.id;
                let processName = request.query.processName;
                let elementId = request.query.elementId;
                let errors;
                
                const instances = await this.bpmnServer.dataStore.findInstances({ "items.id": id }, 'full');
                const instance = instances[0];
    
    
                let { node, fields } = await ViewHelper.getNodeInfo(bpmnServer,processName, elementId);

                let cache=[];
                let node2=
                JSON.stringify(node, (key, value) => {
                    if (typeof value === 'object' && value !== null) {
                      // Duplicate reference found, discard key
                      if (cache.includes(value)) return;
                  
                      // Store value in our collection
                      cache.push(value);
                    }
                    return value;
                  });
                cache=null;

                let data = ViewHelper.formatData(instance.data);
    
                response.json({ errors: [], node: JSON.parse(node2),fields ,data });
            }));

        /*
            returns list of current instances running or ended
        */
        router.get('/engine/status', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            try {

                var list = [];
                CacheManager.liveInstances.forEach(exec => {
                    list.push({ instance: exec.instance, currentItem: exec.item.id,currentElement: exec.item.elementId, status: exec.instance.status });
                });
                response.json({cache:list,engine: this.bpmnServer.engine.status()});
            }
            catch (exc) {
                response.json({ error: exc.toString() });
            }
        }));

        router.post('/engine/start/:name?', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            try {
                let name = request.params.name;
                if (!name)
                    name = request.body.name;
                //console.log(' starting ' + name);
                //console.log(request.body);
                let data = request.body.data;

                let startNodeId, options = {}, userName;
                if (request.body.startNodeId) {
                    startNodeId = request.body.startNodeId;
                }
                if (request.body.options) {
                    options = request.body.options;
                }

                if(options['userName'] !== undefined){
                    userName = options['userName']
                }else if (request.body.userName) {
                    userName = request.body.userName;
                }

                let context;
                //console.log(data,userName);
                context = await this.bpmnServer.engine.start(name, data, startNodeId, userName, options);
                response.json(context.instance);
            }
            catch (exc) {
                response.json({ error: exc.toString() });
            }
        }));
        ///
        router.put('/engine/assign', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            //console.log(request.body);
            let query, data,userName,assignment;
            if (request.body.query) {
                query = request.body.query;
            }
            if (request.body.data) {
                data = request.body.data;
            }
            if (request.body.assignment) {
                assignment = request.body.assignment;
            }

            if (request.body.userName) {
                userName= request.body.userName;
            }

            //console.log(query);
            let context;
            let instance;
            let errors;
            try {

                context = await this.bpmnServer.engine.assign(query, data, assignment, userName);
                instance = context.instance;
                if (context && context.errors)
                    errors = context.errors.toString();
            }
            catch (exc) {
                errors = exc.toString();
                console.log(errors);
            }
            response.json({ errors: errors, instance });

        }));

        ///
        router.put('/engine/invoke', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            //console.log('---------invoke',request.body);
            let query, data,userName,options;
            if (request.body.query) {
                query = request.body.query;
            }
            if (request.body.data) {
                data = request.body.data;
            }
            if (request.body.options) {
                options = request.body.options;
            }

            if (request.body.userName) {
                userName= request.body.userName;
            }

            let context;
            let instance;
            let errors;
            try {

                context = await this.bpmnServer.engine.invoke(query, data,userName,options );
                instance = context.instance;
                if (context && context.errors)
                    errors = context.errors.toString();
            }
            catch (exc) {
                errors = exc.toString();
                console.log(errors);
            }
            response.json({ errors: errors, instance });


        }));
        ///
        router.put('/engine/startEvent', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            let instanceId, data,startNodeId,userName,options;
            if (request.body.instanceId) {
                instanceId = request.body.instanceId;
            }
            if (request.body.startNodeId) {
                startNodeId = request.body.startNodeId;
            }

            if (request.body.data) {
                data = request.body.data;
            }
            if (request.body.options) {
                options = request.body.options;
            }

            if (request.body.userName) {
                userName= request.body.userName;
            }
            let context;
            let instance;
            let errors;
            try {
                context = await this.bpmnServer.engine.startEvent(instanceId, startNodeId, data,userName, options);
                //context = await this.bpmnServer.engine.restart(query, data,userName,options );
                instance = context.instance;
                if (context && context.errors)
                    errors = context.errors.toString();
            }
            catch (exc) {
                errors = exc.toString();
                console.log(errors);
            }
            response.json({ errors: errors, instance });


        }));



        router.put('/engine/restart', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            let query, data,startNodeId,userName,options;
            if (request.body.query) {
                query = request.body.query;
            }
            if (request.body.data) {
                data = request.body.data;
            }
            if (request.body.options) {
                options = request.body.options;
            }

            if (request.body.userName) {
                userName= request.body.userName;
            }
            let context;
            let instance;
            let errors;
            try {
                context = await this.bpmnServer.engine.restart(query, data,userName,options );
                instance = context.instance;
                if (context && context.errors)
                    errors = context.errors.toString();
            }
            catch (exc) {
                errors = exc.toString();
                console.log(errors);
            }
            response.json({ errors: errors, instance });


        }));

        ///
        router.get('/engine/get', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            let query;
            if (request.body.query) {
                query = request.body.query;
            }
            else
                query = request.body;

            //console.log("Query", query);
            let context;
            let instance;
            let errors;
            try {
                context = await this.bpmnServer.engine.get(query);
                instance = context.instance;
            }
            catch (exc) {
                errors = exc.toString();
                console.log(errors);
            }
            response.json({ errors: errors, instance });
        }));


        /*
            *      response = await bpmn.engine.throwMessage(messageId,data);
        */
        router.post('/engine/throwMessage', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            try {
                let messageId = request.body.messageId;
                //console.log(' MessageId ' + messageId);
                let data = request.body.data;
                let messageMatchingKey = {};

                if (request.body.messageMatchingKey)
                    messageMatchingKey = request.body.messageMatchingKey;

                let context;
                //console.log(data);

                context = await this.bpmnServer.engine.throwMessage(messageId, data, messageMatchingKey);
                if (context)
                    response.json(context.instance);
                else
                    response.json({});

            }
            catch (exc) {
                console.log(exc);
                response.json({ error: exc.toString() });
            }
        }));


        /*
            *  engine.throwSignal     - issue a signal by id
        *  ------------------
            *      same as message except multiple receipients
        *
            *
            *
            */

        router.post('/engine/throwSignal', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            try {
                let signalId = request.body.signalId;
                //console.log(' Signal Id: ' + signalId);
                let data = request.body.data;
                let messageMatchingKey = {};

                if (request.body.messageMatchingKey)
                    messageMatchingKey = request.body.messageMatchingKey;
                let context;

                context = await this.bpmnServer.engine.throwSignal(signalId, data, messageMatchingKey);
                response.json(context);
            }
            catch (exc) {
                console.log(exc);
                response.json({ error: exc.toString() });
            }
        }));


        ///
        router.put('/engine/upgrade', loggedIn, awaitAppDelegateFactory(async (request, response) => {

            let model, nodeIds;
            if (request.body.model) {
                model = request.body.model;
            }
            if (request.body.nodeIds) {
                nodeIds = request.body.nodeIds;
            }
            let result;
            let errors;
            try {

                result = await this.bpmnServer.engine.upgrade(model, nodeIds );
                if (result && result.errors)
                    errors = result.errors.toString();
            }
            catch (exc) {
                errors = exc.toString();
                console.log(errors);
            }
            response.json({ errors: errors, result });

        }));


        ////
        var fsx = require('fs-extra');       //File System - for file manipulation

            router.post('/definitions/import/:name?', loggedIn, awaitAppDelegateFactory(async (request, response) => {

                let name = request.params.name;
                if (!name)
                    name = request.body.name;
                //console.log(' importing: ' + name);
                //console.log('request', request);
                //console.log('request.body',request.body);

                var fstream;
                var files=[];

                try {
                    if (request.busboy) {
                        request.pipe(request.busboy);
                        request.busboy.on('file', function (fileUploaded, file, filename) {
                            // no longer writing to tmp
                            //Path where image will be uploaded
                            //const filepath = __dirname + '/../tmp/' + filename.filename;
                            var contents='';
                            file.on('data', (data) => {
                                contents+=data;
                                console.log(`File [${filename.filename}] got ${data.length} bytes`);
                            }).on('close', () => {
                                console.log(`File [${filename.filename}] done`);
                                files.push(contents);
                            });

                            //                        file.pipe(fsx.createWriteStream(filepath));
                            //                        const fileC= fsx.readFileSync(filepath,{ encoding: 'utf8', flag: 'r' });
                            //                        files.push(fileC);
                        });
                        request.busboy.on('finish',  async function () {
                            var bpmnFile,svgFile=null;
                            bpmnFile=files[0];

                            if (files.length>1)
                                svgFile= files[1];

                            try {
                                await bpmnServer.definitions.save(name, bpmnFile,svgFile);
                            }
                            catch(exc)
                            {
                                console.log('error in api.ts import ',exc.message,exc);
                                response.json({errors:  exc.message});
                                return;
                            }

                            response.json("OK");

                        });
                    }
                    else {
                        response.json("No file to import");
                    }

                }
                catch (exc) {

                    console.log('request.pipe error:', exc);
                    response.json(exc);
                }

            }));


            router.post('/definitions/rename', loggedIn, async function (req, response) {

                let name = req.body.name;
                let newName = req.body.newName;
                //console.log('renaming ', name, newName);
                try {
                    var ret = await bpmnServer.definitions.renameModel(name, newName);
                    //console.log('ret:',ret);
                    response.json(ret);
                }
                catch (exc) {
                    console.log('error:',exc);
                    response.json({ errors: exc });
                }
            });

            router.post('/definitions/delete', loggedIn, async function (req, response) {

                let name = req.body.name;
                //console.log('deleting ', name);
                try {
                    var ret = await bpmnServer.definitions.deleteModel(name);
                    //console.log('ret: ',ret);
                    response.json(ret);
                }
                catch (exc) {
                    console.log('error:', exc);
                    response.json({ errors: exc.toString()});
                }
            });

            router.get('/definitions/list', loggedIn, async function (req, response) {

                let list = await bpmnServer.definitions.getList();
                //console.log(list);
                response.json(list);
            });
            router.get('/definitions/load/:name?', loggedIn, async function (request, response) {

                //console.log(request.params);
                let name = request.params.name;

                try {
                    let definition = await bpmnServer.definitions.getSource(name);
                    response.send(definition);
                } catch (error) {
                    response.status(404).send(error);
                    return;
                }
            });

            router.post('/model/save', loggedIn, async function (request, response) {

                const name = request.body.name;
                const bpmn = request.body.xml;
                const svg = '';
                let definitionsPath = bpmnServer.configuration.definitionsPath;
                let fullpath = definitionsPath + '/' + name + '.bpmn';

                console.log(fullpath, bpmn);
                fsx.writeFile(fullpath, bpmn, function (err) {
                    if (err) throw err;
                    console.log(`Saved bpmn to ${fullpath}`);
                });
                await bpmnServer.definitions.save(name, bpmn, svg);
                console.log(" save completed");

                //        console.log(request);
                response.status(200).send("");

            });

            router.delete('/datastore/deleteInstances', loggedIn, awaitAppDelegateFactory(async (request, response) => {

                let query;
                if (request.body.query) {
                    query = request.body.query;
                }
                else
                    query = request.body;

                //console.log(query);

                let errors;
                let result;
                try {
                    result = await this.bpmnServer.dataStore.deleteInstances(query);
                }
                catch (exc) {
                    errors = exc.toString();
                    console.log(errors);
                }
                response.json({ errors: errors, result });

            }));

            router.put('/rules/invoke', loggedIn, awaitAppDelegateFactory(async (request, response) => {
                /*
                    * 
                    * 
                    export async function WebService(request, response) {
                    console.log(request);
                    console.log(response);
                    let { definition, data, options, loadFrom } = request.body;
                    response.json(Execute(request.body));
                }
                */
                try {
                    throw new Error("Decision Table not supported this release.");
                    // await response.json(ExecuteDecisionTable(request.body));
                    //await WebService(request, response);
                }
                catch (exc) {
                    console.log(exc);
                    response.json({ errors: JSON.stringify(exc, null, 2) });
                }
            }));

            return router;
    }
}

export default router;
