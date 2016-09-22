// https://developers.facebook.com/docs/messenger-platform/send-api-reference/generic-template 
// https://developers.facebook.com/apps/177221719342534/webhooks/
// https://github.com/makisho/api-ai-facebook/blob/master/src/app.js
// https://dashboard.heroku.com/apps/intense-cove-74475/logs
// https://discuss.api.ai/t/test-clan-facebook-messenger-bot/814/3


'use strict';

const apiai = require('apiai');
const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const request = require('request');
const JSONbig = require('json-bigint');
const async = require('async');

const REST_PORT = (process.env.PORT || 5000);
const APIAI_ACCESS_TOKEN = process.env.APIAI_ACCESS_TOKEN;
const APIAI_LANG = process.env.APIAI_LANG || 'en';
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const apiAiService = apiai(APIAI_ACCESS_TOKEN, {language: APIAI_LANG, requestSource: "fb"});
const sessionIds = new Map();
var responseParams;

function processEvent(event) {
    var sender = event.sender.id.toString();

    if ((event.message && event.message.text) || (event.postback && event.postback.payload)) {
        var text = event.message ? event.message.text : event.postback.payload;
        // Handle a text message from this sender

        if (!sessionIds.has(sender)) {
            sessionIds.set(sender, uuid.v1());
        }

        console.log("USER SAY : ", text);

        let apiaiRequest = apiAiService.textRequest(text,
            {
                sessionId: sessionIds.get(sender)
            });

        apiaiRequest.on('response', (response) => {
            if (isDefined(response.result)) {
                console.log(' apiaiRequest 1 set string >>>> '+JSON.stringify(response.result));
                let responseText = response.result.fulfillment.speech;
                let responseData = response.result.fulfillment.data;
                let FBtemplate = response.result.parameters.FBtemplate;
                let FBimage = response.result.parameters.FBimage;
                               
                String.prototype.replaceAll = function(str1, str2, ignore) 
                {
                    return this.replace(new RegExp(str1.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g,"\\$&"),(ignore?"gi":"g")),(typeof(str2)=="string")?str2.replace(/\$/g,"$$$$"):str2);
                } 
                
               
                
                let action = response.result.action;
                
                console.log(' apiaiRequest response.result.action > '+response.result.action);
                
                if(FBtemplate!=undefined){
                    console.log('HAY FACEBOOK DATA');
                    var r1 = FBtemplate.replaceAll("^", "{");
                    responseParams = r1.replaceAll("*", "}");
                    console.log('-------------------------------')
                    console.log('apiaiRequest responseParams >>>>>>>>  '+responseParams);        
                    console.log('-------------------------------')
                    sendFBMessage(action, sender, responseParams);      
                }
                else if(FBimage!=undefined){
                    if (isDefined(responseData) && isDefined(responseData.facebook)) {
                        try {
                            sendFBMessage(action, sender, responseData.facebook);
                        } catch (err) { 
                            sendFBMessage(action, sender, {text: err.message});
                        }
                    }
                    var r1 = FBimage.replaceAll("^", "{");
                    responseParams = r1.replaceAll("*", "}");
                    sendFBMessage(action, sender, responseParams); 
                }
                else if (isDefined(responseData) && isDefined(responseData.facebook)) {
                    if (!Array.isArray(responseData.facebook)) {
                        try {
                            console.log('Response as formatted message');
                            sendFBMessage(action, sender, responseData.facebook);
                        } catch (err) { 
                            sendFBMessage(action, sender, {text: err.message});
                        }
                    } else {
                        responseData.facebook.forEach((facebookMessage) => {
                            try {
                                if (facebookMessage.sender_action) {
                                    console.log('Response as sender action');
                                    sendFBSenderAction(action, sender, facebookMessage.sender_action);
                                }
                                else {
                                    console.log('Response as formatted message');
                                    sendFBMessage(action, sender, facebookMessage);
                                }
                            } catch (err) {
                                sendFBMessage(sender, {text: err.message});
                            }
                        });
                    }
                } else if (isDefined(responseText)) {
                    console.log('Response as splittedText message');
                    // facebook API limit for text length is 320,
                    // so we must split message if needed
                    var splittedText = splitResponse(responseText);

                    async.eachSeries(splittedText, (textPart, callback) => {
                        sendFBMessage(action, sender, {text: textPart}, callback);
                    });
                }

            }
        });

        apiaiRequest.on('error', (error) => console.error(error));
        apiaiRequest.end();
    }
}

function splitResponse(str) {
    if (str.length <= 320) {
        return [str];
    }

    return chunkString(str, 300);
}

function chunkString(s, len) {
    var curr = len, prev = 0;

    var output = [];

    while (s[curr]) {
        if (s[curr++] == ' ') {
            output.push(s.substring(prev, curr));
            prev = curr;
            curr += len;
        }
        else {
            var currReverse = curr;
            do {
                if (s.substring(currReverse - 1, currReverse) == ' ') {
                    output.push(s.substring(prev, currReverse));
                    prev = currReverse;
                    curr = currReverse + len;
                    break;
                }
                currReverse--;
            } while (currReverse > prev)
        }
    }
    output.push(s.substr(prev));
    return output;
}

function sendFBMessage(action, sender, messageData, callback) {

    var _action = action;
    console.log('sendFBMessage _action(string): '+JSON.stringify(_action)); 
    console.log('sendFBMessage messageData: '+JSON.stringify(messageData));

    var _myjson = {
            recipient: {id: sender},
            message:  messageData
            //message: {"attachment":{"type":"image","payload":{"url":"https://holatiguan.com/uploads/images/2/0/-/20-di-hola-tiguan.png"}}}
            /*
            message: { "attachment":{"type":"template","payload":{
                "template_type":"generic",
                "elements":[
                  {
                    "title":"HolaTiguan.com\nDescubre el Nuevo Tiguan. ",
                    "image_url":"https://holatiguan.com/uploads/images/2/0/-/20-di-hola-tiguan.png",
                    "subtitle":"Pregúntame todo lo que quieras saber.",
                    "buttons":[
                      {
                        "type":"web_url",
                        "url":"https://holatiguan.com",
                        "title":"View Website"
                      },
                      {"type":"postback","title":"Start Chatting","payload":"USER_DEFINED_PAYLOAD"}]}]}}}
            */
            
        }
    
    
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: FB_PAGE_ACCESS_TOKEN},
        method: 'POST',
        json:_myjson 
    }, (error, response, body) => {
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }

        if (callback) {
            callback();
        }
    });
}

function sendFBSenderAction(sender, action, callback) {
    setTimeout(() => {
        request({
            url: 'https://graph.facebook.com/v2.6/me/messages',
            qs: {access_token: FB_PAGE_ACCESS_TOKEN},
            method: 'POST',
            json: {
                recipient: {id: sender},
                sender_action: action
            }
        }, (error, response, body) => {
            if (error) {
                console.log('Error sending action: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }
            if (callback) {
                callback();
            }
        });
    }, 1000);
}

function doSubscribeRequest() {
    request({
            method: 'POST',
            uri: "https://graph.facebook.com/v2.6/me/subscribed_apps?access_token=" + FB_PAGE_ACCESS_TOKEN
        },
        (error, response, body) => {
            if (error) {
                console.error('Error while subscription: ', error);
            } else {
                console.log('Subscription result: ', response.body);
            }
        });
}

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}

const app = express();

app.use(bodyParser.text({type: 'application/json'}));

app.get('/webhook/', (req, res) => {
    if (req.query['hub.verify_token'] == FB_VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);

        setTimeout(() => {
            doSubscribeRequest();
        }, 3000);
    } else {
        res.send('Error, wrong validation token');
    }
});

app.post('/webhook/', (req, res) => {
    try {
        var data = JSONbig.parse(req.body);

        if (data.entry) {
            let entries = data.entry;
            entries.forEach((entry) => {
                let messaging_events = entry.messaging;
                if (messaging_events) {
                    messaging_events.forEach((event) => {
                        if (event.message && !event.message.is_echo ||
                            event.postback && event.postback.payload) {
                            processEvent(event);
                        }
                    });
                }
            });
        }

        return res.status(200).json({
            status: "ok"
        });
    } catch (err) {
        return res.status(400).json({
            status: "error",
            error: err
        });
    }

});

app.listen(REST_PORT, () => {
    console.log('Rest service ready on port ' + REST_PORT);
});

doSubscribeRequest();
