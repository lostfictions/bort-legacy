const envalid = require('envalid')
const env = envalid.cleanEnv(process.env, {
  SLACK_TOKEN: envalid.str(),
  OPENSHIFT_NODEJS_PORT: envalid.num({ default: 8080 }),
  OPENSHIFT_NODEJS_IP: envalid.str({ default: 'localhost' }) 
})

const fs = require('fs')
const os = require('os')

const botkit = require('botkit')
const moment = require('moment')

const app = require('express')()
app.get('/', (req, res) => {
  res.status(200).end()
})
// app.set('hostname', env.OPENSHIFT_APP_DNS)
// app.set('port', env.OPENSHIFT_NODEJS_PORT)
// app.set('ipaddr', env.OPENSHIFT_NODEJS_IP)
app.listen(env.OPENSHIFT_NODEJS_PORT, env.OPENSHIFT_NODEJS_IP)

function randomInArray(arr) { return arr[Math.floor(Math.random() * arr.length)] }

const data = {
  repo: 'https://github.com/lostfictions/bort',
  watchlist: fs.readFileSync('data/vidnite_links.txt').toString().split('\n')
}

const controller = botkit.slackbot({
  // debug: true
})

controller.spawn({
  token: env.SLACK_TOKEN
}).startRTM((err, bot, payload) => {
  if(err) {
    console.error(err)
  }
  else {
    const channels = payload.channels.filter(c => c.is_member && !c.is_archived)
    channels.forEach(c => bot.say({
      text: randomInArray([
        "it's bort",
        "its bort",
        "still bort",
        "hi im bort",
        "bort here",
        "it is bort",
        "why bort",
        "bort :(",
        ":("
      ]),
      channel: c.id
    }))
  }
})

controller.hears('!vidrand', 'ambient', (bot, message) => {
  bot.reply(message, randomInArray(data.watchlist))
})

controller.hears(
  ['where do you live', 'repo', 'home'],
  ['direct_mention', 'mention'],
  (bot, message) => {
    bot.reply(message, data.repo)
  }
)

controller.hears(
  ['remember '],
  ['direct_mention', 'mention'],
  (bot, message) => {
    bot.reply(message, data.repo)
  }
)


controller.hears(
  ['hello', 'hi'],
  ['direct_message','direct_mention','mention'],
  (bot, message) => {
    bot.api.reactions.add(
      {
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face'
      },
      (err, res) => {
        if(err) {
          bot.botkit.log('Failed to add emoji reaction :(', err)
        }
      }
    )

    controller.storage.users.get(message.user, (err, user) => {
      if(user && user.name) {
        bot.reply(message, 'Hello ' + user.name + '!!')
      }
      else {
        bot.reply(message, 'Hello.')
      }
    })
  }
)

controller.hears(['call me (.*)', 'my name is (.*)'], ['direct_message','direct_mention','mention'], (bot, message) => {
  const name = message.match[1]
  controller.storage.users.get(message.user, (err, user) => {
    if(err) {
      bot.botkit.log('Error retrieving user', err)
    }
    const resolvedUser = user || {
      id: message.user
    }
    resolvedUser.name = name
    controller.storage.users.save(resolvedUser, (err, id) => {
      if(err) {
        bot.botkit.log('Error storing user', err)
      }
      bot.reply(message, 'Got it. I will call you ' + resolvedUser.name + ' from now on.')
    })
  })
})

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', (bot, message) => {

  controller.storage.users.get(message.user, function (err, user) {
    if (user && user.name) {
      bot.reply(message, 'Your name is ' + user.name);
    } else {
      bot.startConversation(message, function (err, convo) {
        if (!err) {
          convo.say('I do not know your name yet!');
          convo.ask('What should I call you?', function (response, convo) {
            convo.ask('You want me to call you `' + response.text + '`?', [
              {
                pattern: 'yes',
                callback: function (response, convo) {
                  // since no further messages are queued after this,
                  // the conversation will end naturally with status == 'completed'
                  convo.next();
                }
              },
              {
                pattern: 'no',
                callback: function (response, convo) {
                  // stop the conversation. this will cause it to end with status == 'stopped'
                  convo.stop();
                }
              },
              {
                default: true,
                callback: function (response, convo) {
                  convo.repeat();
                  convo.next();
                }
              }
            ]);

            convo.next();

          }, { 'key': 'nickname' }); // store the results in a field called nickname

          convo.on('end', function (convo) {
            if (convo.status == 'completed') {
              bot.reply(message, 'OK! I will update my dossier...');

              controller.storage.users.get(message.user, function (err, user) {
                if (!user) {
                  user = {
                    id: message.user,
                  };
                }
                user.name = convo.extractResponse('nickname');
                controller.storage.users.save(user, function (err, id) {
                  bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                });
              });



            } else {
              // this happens if the conversation ended prematurely for some reason
              bot.reply(message, 'OK, nevermind!');
            }
          });
        }
      });
    }
  });
});


/*
controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function (bot, message) {

  bot.startConversation(message, function (err, convo) {

    convo.ask('Are you sure you want me to shutdown?', [
      {
        pattern: bot.utterances.yes,
        callback: function (response, convo) {
          convo.say('Bye!');
          convo.next();
          setTimeout(function () {
            process.exit();
          }, 3000);
        }
      },
      {
        pattern: bot.utterances.no,
        default: true,
        callback: function (response, convo) {
          convo.say('*Phew!*');
          convo.next();
        }
      }
    ]);
  });
});
*/

controller.hears(
  ['uptime', 'identify yourself', 'who are you', 'what is your name'],
  ['direct_message','direct_mention','mention'],
  (bot, message) => {
    const hostname = os.hostname()
    const uptime = moment.duration(process.uptime(), 'seconds').humanize()

    bot.reply(
      message,
      `:robot_face: I am a bot named <@${bot.identity.name}>. I have been running for ${uptime} on ${hostname}.`
    )
  }
)
