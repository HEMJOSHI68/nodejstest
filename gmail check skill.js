var brycpt = require('bcryptjs');
var AWS = require('aws-sdk');
AWS.config.update({
  region:"us-east-1",
});
var https = require('https');
var MAX_READ_MESSAGES = 3;
var MAX_MESSAGES = 20;
var Promise = require('bluebird');
var docClient = new AWS.DynamoDB.DocumentClient();

function onSessionStarted(sessionStartedRequest, session) {
    logger.debug('onSessionStarted requestId=' + sessionStartedRequest.requestId + ', sessionId=' + session.sessionId);
    // add any session init logic here
    
}

function onSessionEnded(sessionEndedRequest, session) {
  logger.debug('onSessionEnded requestId=' + sessionEndedRequest.requestId + ', sessionId=' + session.sessionId);
  // Add any cleanup logic here
  
}

function onLaunch(launchRequest, session, response) {
  logger.debug('onLaunch requestId=' + launchRequest.requestId + ', sessionId=' + session.sessionId);
  response.speechText = "Welcome to email checker skill. You can use this skill to check your gmail messages. You can say what's new ?";
  response.repromptText = "What do you want to do ? You can say, what's new ?";
  response.shouldEndSession = false;
  response.done();
}

intentHandlers['EmailCheckIntent'] = function(request,session,response){
 readPin(session.user.UserId, function(res,err){
  if(err){
    response.fail(err);
  }else if(!res){
    response.speechText="You haven't set pin. Please set a pin. You can set any number";
    response.repromptText="For example, you can say set my pin to 1234";
  }else{
    response.speechText="Please tell me what is your pin";
    response.repromptText="What is your pin ?";
    session.attributes.EmailCheckIntent  =true; //set true when you want the intents to be linked
    session.attributes.pin = res.Item.pin;
    response.shouldEndSession = false;
    response.done();
  }
 });
}

intentHandlers['SetPinIntent'] = function(request,session,response,slots){
var setPin = slots.SPin;
readPin(session.user.UserId, setPin,function(rPin,err){
  if(err){
    response.fail(err);
  }else if(!rPin){
    createPin(session.user.UserId,setPin,function(res,err){
      if(res){
      response.speechText = `Your pin has been set as <say-as interpret-as="digits">${setPin}</say-as>`;
      response.shouldEndSession = true;
      response.done();
    }else{
        response.fail(err);
      }
    });
  }else{
    response.speechText="Please tell me your current pin.";
    response.repromptText="For example my pin is 1234";
    response.shouldEndSession = false;
    session.attributes.setPin = setPin;
    session.attributes.pin = rPin.Item.pin;
    response.done();
  }
});

}

intentHandlers['EmailAuthIntent'] = function(request,session,response,slots) {
  var cPin = slots.CPin;
  var sPin = session.attributes.setPin;

   if(sPin) {
      bcrypt.compare(cPin, session.attributes.pin, function(err, res) {

        if(!res) {
          response.speechText = `Wrong secret pin <say-as interpret-as="digits">${cPin}</say-as>`;
          response.shouldEndSession = true;
          response.done();
        } else {
          updatePin(session.user.userId, sPin, function(updateRes,err) { 
            if(updateRes) {
              response.speechText = `Successfully updated pin to  <say-as interpret-as="digits">${sPin}</say-as>. `;
              response.shouldEndSession = true;
              response.done();
            } else {
              response.fail(err);
            }
          });

        }

      });

   } else if(session.attributes.EmailCheckIntent) {

     if(!session.user.accessToken) {
      response.speechText = "No token found"; 
      response.done();
     } else {

      bcrypt.compare(cPin, session.attributes.pin, function(err, res) {

        if(!res) {
          response.speechText = "Wrong secret pin "+cPin;
          response.shouldEndSession = true;
          response.done();
        } else {
          getMessages(response,session);
        }

      });

     }
   } else {
      response.speechText = "Wrong invocation of this intent";
      response.shouldEndSession = true;
      response.done();
   }
}

//To read from dynamo db we use the aws-sdk, make a variable named docClient which reads from dynamoDB
function readPin(UserId, callbak){
  var params = {
    TableName: "UserPins",
    Key:{
      "UserId": UserId
    }
  };
docClient.get(params,function(err,data){
  if(err){
    callbak(false,err)
    logger.error("Unable to read from the table",JSON.stringify(err,null,2));
  }else{
    logger.debug(data)
    if(Object.keys(data).length===0){
      callbak(false);
    }else{
      callbak(data);
    }
  }
});
}

//To update a value in the dynamo DB
function updatePin(UserId,pin,callback){
  var hash = brycpt.hashSync(pin,10);
  logger.debug(`${pin} hash is ${hash}`);
  var params = {
    TableName:"UserPins",
    Key: {
      "UserId":UserId
    },
    UpdateExpression: "set pin = :p",
    ExpressionAttributeValues:{
      ":p":hash
    },
    ReturnedValues:"UPDATED_NEW"
  };
  logger.debug("Updating the items...");
  docClient.update(params,function(err,data){
    if(err){
      logger.debug("Unable to update",JSON.stringify(err,null,2));
      callback(false,err);
    }else{
      logger.debug("Unable to update",JSON.stringify(data,null,2));
      callback(true)
    }
  });
}

//To put the values into the database 
function createPin(UserId,pin,callback){
  var hash = brycpt.hashSync(pin,10);
  logger.debug(`${pin} hash is ${hash}`);
    var params = {
      TableName:"UserPins",
      Item:{
          "UserId":UserId,
          "pin":hash
      }
    };

docClient.put(params,function(err,data){
  if(err){
    callback(false,err);
    logger.debug("Unable to add item", JSON.stringify(err,null,2));
  }else{
    logger.debug("Sucessfully added items",JSON.stringify(data,null,2));
    callback(true);
  }
});
}

function getMessages(response,session) {
  var url;
  url = `https://www.googleapis.com/gmail/v1/users/me/messages?access_token=${session.user.accessToken}&q="is:unread"`;
  logger.debug(url);
  https.get(url, function(res) {
      var body = '';

      res.on('data', function (chunk) {
          body += chunk;
      });

      res.on('end', function () {
          var result = JSON.parse(body);
          var messages;
          if(result.resultSizeEstimate) {
            response.speechText = `You have total ${result.resultSizeEstimate} unread mails. `;
            response.speechText += `Here are your top mails.  `;

            messages = result.messages;
            if(messages.length > MAX_READ_MESSAGES) {
              session.attributes.messages = messages.slice(0,MAX_MESSAGES);
              messages = messages.slice(0,MAX_READ_MESSAGES);
              session.attributes.offset = MAX_READ_MESSAGES;
            }
            readMessagesFromIds(messages, response, session);
          } else {
            response.fail(body);
          }

      });
  }).on('error', function (e) {
      response.fail(e);
  });

}

function readMessagesFromIds(messages,response,session){
  logger.debug(messages);
  var promises = messages.map(function(message){
    return new Promise(function(resolve,reject){
      getMessageFromId(message.id,session.user.accessToken, function(res,err){
      var from = res.payload.headers.find(o => o.name==='From').value;
      from = from.replace(/<.*/,'');
      message.result = {
        snippet: res.snippet,
        subject: res.payload.headers.find(o=>o.name === 'Date').value,
        from: from
      };
      resolve();
    });
  });
});

Promise.all(promises).then(function(){
  messages.forEach(function(message,idx) {
    response.speechText +=`<say-as interpret-as="ordinal">${idx+1}</say-as>Mail from ${message.result.from} with subject ${message.result.subject}.`;
  });

  response.shouldEndSession = true;
  if(session.attributes.offset && session.attributes.messages.length > session.attributes.offset){
    response.speechText += "Do you want to continue ?";
    response.repromptText = "You can say yes or stop";
    response.shouldEndSession = false;
  }
  response.done();
  }).catch(function(err){
    response.fail(err);
  });

}

function getMessageFromId(messageId,token,callback){
  var url =` https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=subject&metadataHeaders=From&metadataHeaders=Date&access_token=${token}`;
https.get(url,function(res){
var body = '';

res.on('data',function(chunk){
  body += chunk;
});

res.on('end', function(){
  logger.debug(body);
  var result = JSON.parse(body);
  callback(result);
});
}).on('error',function(e){
  logger.error("An error has occured: ",e);
  callback(e);
});
}

intentHandlers['AMAZON.YesIntent'] = function(request,session,response){
  var messages;

  if(session.attributes.messages && session.attributes.offset > 0){
    messages = session.attributes.messages.slice(session.attributes.offset);
    logger.debug(session.attributes.messages);
    if(messages.length > MAX_READ_MESSAGES){
      messages = messages.slice(0,MAX_READ_MESSAGES);
      session.attributes.offset +=MAX_READ_MESSAGES;
    }
    session.attributes.offset += MAX_READ_MESSAGES;
    readMessagesFromIds(messages,response,session);
  }else{
    response.speechText = "Wrong invocation";
    response.shouldEndSession = true;
    response.done();
  }
}

intentHandlers['AMAZON.StopIntent'] = function(request,session,response,slots) {
  response.speechText  = `Good Bye. `;
  response.shouldEndSession = true;
  response.done();
};
