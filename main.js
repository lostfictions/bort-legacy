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

const botName = 'bort'

//Open a ping service so the OpenShift app doesn't idle
const app = require('express')()
app.set('port', env.OPENSHIFT_NODEJS_PORT)
app.get('/', (req, res) => {
  res.status(200).end()
})
app.listen(env.OPENSHIFT_NODEJS_PORT, env.OPENSHIFT_NODEJS_IP)

function randomInArray(arr) { return arr[Math.floor(Math.random() * arr.length)] }

const greetz = [
  "it's bort",
  "its bort",
  "still bort",
  "hi im bort",
  "bort here",
  "it is bort",
  "why bort",
  "bort :(",
  ":(",
  "help me"
]

const confirmations = [
  'ok.',
  'awright.',
  'got it!',
  'i see.',
  'sure!',
  'fine,',
  'whatever, asshole.',
  'i guess?'
]

const quips = [
  'yeah!',
  'word.',
  'bort',
  'bort!',
  'bort?'
]

const data = {
  repo: 'https://github.com/lostfictions/bort',
  watchlist: fs.readFileSync('data/vidnite_links.txt').toString().split('\n')
}

const controller = botkit.slackbot({
  // debug: true
})

const users = {}

controller.spawn({
  token: env.SLACK_TOKEN
}).startRTM((err, bot, payload) => {
  if (err) {
    console.error(err)
  }
  else {
    payload.users.forEach(u => users[u.id] = u.name)
    const channels = payload.channels.filter(c => c.is_member && !c.is_archived)
    channels.forEach(c => bot.say({
      text: randomInArray(greetz),
      channel: c.id
    }))
  }
})

const directListens = {}
const ambientListens = {}

const listenRegex = /([\w\W]+)\s+?(?:is|equals|means)\s+?([\w\W]+)/i

const commands = {
  remember: (b, m, t) => {
    const matches = t.match(listenRegex)
    if (matches === null) {
      return
    }
    const keyword = matches[1]
    let response = matches[2]
    if (response.startsWith('<') && response.endsWith('>') && !response.startsWith('<@')) {
      response = response.slice(1, -1)
    }
    directListens[keyword] = {
      response: response,
      user: users[m.user],
      setTime: moment()
    }
    b.reply(m, `${randomInArray(confirmations)} if anyone asks me about *${keyword}* i'll be sure to let them know the truth.`)
  },

  listen: (b, m, t) => {
    const matches = t.match(listenRegex)
    if (matches === null) {
      return
    }
    const keyword = matches[1]
    let response = matches[2]
    if (response.startsWith('<') && response.endsWith('>') && !response.startsWith('<@')) {
      response = response.slice(1, -1)
    }
    ambientListens[keyword] = {
      response: response,
      user: users[m.user],
      setTime: moment()
    }
    b.reply(m, `${randomInArray(confirmations)} i'll let people know about *${keyword}* if i hear it.`)
  },

  forget: (b, m, t) => {
    if (t in ambientListens) {
      delete ambientListens[t]
      b.reply(m, `r i p ~${t}~`)
    }
    else if (t in directListens) {
      delete directListens[t]
      b.reply(m, `r i p ~${t}~`)
    }
  },

  list: (b, m) => b.reply(m,
    '*ASK ME ABOUT*:\n' +
    Object.keys(directListens).map(kw => `*${kw}*: set by *${directListens[kw].user}* ${directListens[kw].setTime.fromNow()}`).join('\n') +
    '\n\n*IF I HEAR EM*:\n' +
    Object.keys(ambientListens).map(kw => `*${kw}*: set by *${ambientListens[kw].user}* ${ambientListens[kw].setTime.fromNow()}`).join('\n').concat()
  ),

  uptime: (b, m) => {
    const hostname = os.hostname()
    const uptime = moment.duration(process.uptime(), 'seconds').humanize()
    b.reply(m, `hi its me <@${botName}> i have been here for *${uptime}* via \`${hostname}\``)
  },

  thing: (b, m) => b.reply(m, {
    attachments: [
      {
        title: 'hello here',
        callback_id: '123',
        attachment_type: 'default',
        actions: [
          {
            "name": "yes",
            "text": ":waving_black_flag: Flag",
            "value": "yes",
            "type": "button"
          },
          {
            "name": "no",
            "text": "No",
            "value": "no",
            "style": "danger",
            "type": "button"
          }
        ]
      }
    ]
  }),

  repo: (b, m) => b.reply(m, data.repo),

  help: (b, m) => b.reply(m, Object.keys(commands).map(c => '`' + c + '`').join(', ')),

  '!vidrand': (b, m) => b.reply(m, randomInArray(data.watchlist))
}

controller.hears(
  ['^(.+?)$'],
  ['ambient'],
  (bot, message) => {
    let text = message.text.toLowerCase()

    //Handle ambient listens
    for (const l of Object.keys(ambientListens)) {
      if (text.indexOf(l) !== -1) {
        bot.reply(message, ambientListens[l].response)
      }
    }

    let shouldCheckCommands = false
    if (text.startsWith(botName)) {
      text = text.slice(botName.length).trim()
      shouldCheckCommands = true
    }
    else if (text.endsWith(botName)) {
      text = text.slice(0, -botName.length).trim()
      shouldCheckCommands = true
    }

    if (shouldCheckCommands) {
      text = text.trim()
      if (text.length > 0) {

        //Handle direct listens
        for (const l of Object.keys(directListens)) {
          if (text.startsWith(l)) {
            bot.reply(message, directListens[l].response)
            return
          }
        }

        //Handle commands
        for (const c of Object.keys(commands)) {
          if (text.startsWith(c)) {
            const textMinusCommand = text.slice(c.length).trim()
            commands[c](bot, message, textMinusCommand)
            return
          }
        }

        bot.reply(message, randomInArray(quips))
      }
    }
  }
)

controller.createWebhookEndpoints(app)

controller.on('interactive_message_callback', (bot, message) => {
  console.log(message.callback_id)
  console.log(message.actions)
  console.dir(message)
})
