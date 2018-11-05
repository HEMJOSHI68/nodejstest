
            // 1) 3 types of requests
            // i)   LaunchRequest       Ex: "Open greeter"
            // ii)  IntentRequest       Ex: "Say hello to John" or "ask greeter to say hello to John"
            // iii) SessionEndedRequest Ex: "exit" or error or timeout
            'use strict';

            var http  = require('http');
            exports.handler = function(event,context){  
                try{
                var request = event.request;
                var session = event.session;
                //Always initialize the session attributes to be safe
                if(!event.session.attributes){
                    event.session.attributes = {};
                }
                if(request.type ==="LaunchRequest"){
                    handleLaunchReq(context);
                }
                else if(request.type ==="IntentRequest"){
                    if(request.intent.name ==="HelloIntent"){
                        handleHelloIntent(request,context);
                    }else if(request.intent.name === "QuoteIntent"){
                        handleQuoteIntent(request, context,session);
                    }else if(request.intent.name === "NextQuoteIntent" ){
                        handleMoreQuoteIntent(request, context,session);
                    }else if(request.intent.name === "AMAZON.StopIntent" || request.intent.name ==="AMAZON.CancelIntent"){
                        context.succeed(buildResponse({
                            speechText:"Bye.",
                            endSession: true
                        }));
                    }
                    else{
                        throw "Unknown intent";
                    }

                }else if(request.type==="SessionEndRequest") {  
                }else{
                throw "Unknown type";
                }
            }catch(e){
                context.fail("Exception" + e);
            }
            }
            
        function getQuote(callback){
            var url =  "http://api.forismatic.com/api/1.0/json?method=getQuote&lang=en&format=json";
            var req = http.get(url, function(res){
                var body = "";

                res.on('data',function(chunk){
                    body += chunk;
                });
                res.on('end', function(){
                    body = body.replace(/\\/g,'');
                    var quote = JSON.parse(body);
                    callback(quote.quoteText);
                });
            });
            req.on('error',function(err){
                callback('',err);
            });
        }

            function getWish(){
                var date  = new Date();
                var hours  = date.getUTCHours - 5;
                if(hours<0){
                    hours = hours+24;
                }
                if(hours<12){
                    return "Good Morning";
                }else if(hours <18){
                    return "Good Afternoon";
                }else{
                    return "Good evening";
                }
            };



            function buildResponse(options){
                var response ={
                    version: "1.0",
                    response: {
                    outputSpeech: {
                        type: "SSML",
                        ssml: "<speak>"+options.speechText+"</speak>"
                    },
                    shouldEndSession: options.endSession
                    }
                };
                if(options.repromptText){
                    response.response.reprompt = {
                        outputSpeech: {
                            type: "SSML",
                            ssml: "<speak>"+options.speechText+"</speak>"
                    }
                };
            } 
                if(options.cardTitle){
                    response.response.card = {
                        type:"Simple",
                        title: options.cardTitle
                    }
                
                if(options.imageUrl){
                    response.response.card.type = "Standard";
                    response.response.card.text = options.cardContent;
                    response.response.card.image = {
                        smallImageUrl: options.imageUrl,
                        largeImageUrl: options.imageUrl
                    };
                }else{
                    response.response.card.content = options.cardContent;
                }
                }

                if(options.session && options.session.attributes){
                    response.sessionAttributes = options.session.attributes;

                }

                return response;

            }

        function handleLaunchReq(context){
            let options = {};
            options.speechText='Welcome to our greeting skills. Whom do you want to speak to ? ';
            options.repromptText='For example say hello John';
            options.endSession=false;
            context.succeed(buildResponse(options));
        }

        function handleHelloIntent(request,context){
            let options = {};
            let name = request.intent.slots.FirstName.value;
             options.speechText = `Hello ${name}<break time = "1s"/>.`;
             options.speechText += getWish();
             options.cardTitle = `Hello ${name}!`; 
             getQuote(function(quote,err){
                if(err){
                    context.fail(err);
                }
                else{
                    options.speechText +=quote;
                    options.cardContent = quote;
                    options.imageUrl = "https://res.cloudinary.com/tempest/image/upload/c_limit,cs_srgb,dpr_1.0,q_100,w_10000/MTQxMTgzOTg2NDQ0NTQzNjgz.jpg";
                    options.endSession = true;      
                    context.succeed(buildResponse(options));
                }
            });


                       
        }

        function handleQuoteIntent(request,context,session){
            let options = {};
            options.session = session;
            getQuote(function(quote,err){
                if(err){
                    context.fail(err);
                }
                else{
                    options.speechText=quote;
                    options.speechText +=`Do you want to listen to more quotes ?`;
                    options.repromptText = "You can say yes or more";
                    options.cardContent = quote;
                    options.session.attributes.quoteIntent = true;
                    options.endSession = false;
                    context.succeed(buildResponse(options));
                }
            });
        }

        
        function handleMoreQuoteIntent(request,context,session){
            let options = {};
            options.session = session;
            if(session.attributes.quoteIntent){
            getQuote(function(quote,err){
                if(err){
                    context.fail(err);
                }
                else{
                    options.speechText=quote;
                    options.speechText +=`Do you want to listen to more quotes ?`;
                    options.repromptText = "You can say yes or more";
                    options.endSession =false;
                    context.succeed(buildResponse(options));
                }
            });
        }else{
            options.speechText = "Sorry wrong command";
            options.endSession  = true;
        }
            
    }