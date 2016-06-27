'use strict' //eslint-disable-line

const envalid = require('envalid')
const env = envalid.cleanEnv(process.env, {
  SLACK_TOKEN: envalid.str(),
  GOOGLE_PRIVATE_KEY: envalid.str(),
  GOOGLE_CLIENT_EMAIL: envalid.email(),
  GOOGLE_SHEET_ID: envalid.str(),
  OPENSHIFT_NODEJS_PORT: envalid.num({ default: 8080 }),
  OPENSHIFT_NODEJS_IP: envalid.str({ default: 'localhost' })
})

const fs = require('fs')
const os = require('os')

const botkit = require('botkit')
const moment = require('moment')
// const _ = require('lodash')

//Open a ping service so the OpenShift app doesn't idle
const app = require('express')()
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

let botName

const users = {}

controller.spawn({
  token: env.SLACK_TOKEN
}).startRTM((err, bot, payload) => {
  if(err) {
    console.error(err)
  }
  else {
    botName = payload.self.name
    payload.users.forEach(u => users[u.id] = u.name) //eslint-disable-line no-return-assign
    const channels = payload.channels.filter(c => c.is_member && !c.is_archived)
    channels.forEach(c => bot.say({
      text: randomInArray(greetz),
      channel: c.id
    }))
  }
})

const storage = {
  directListens: {},
  ambientListens: {}
}

const listenRegex = /([\w\W]+)\s+?(?:is|equals|means)\s+?([\w\W]+)/i

const directCommands = {
  remember: (b, m, t) => {
    const matches = t.match(listenRegex)
    if(matches === null) {
      return
    }
    const keyword = matches[1]
    let response = matches[2]
    if(response.startsWith('<') && response.endsWith('>') && !response.startsWith('<@')) {
      response = response.slice(1, -1)
    }
    storage.directListens[keyword] = {
      response: response,
      user: users[m.user],
      setTime: moment()
    }
    b.reply(m, `${randomInArray(confirmations)} if anyone asks me about *${keyword}* i'll be sure to let them know the truth.`)
  },

  listen: (b, m, t) => {
    const matches = t.match(listenRegex)
    if(matches === null) {
      return
    }
    const keyword = matches[1]
    let response = matches[2]
    if(response.startsWith('<') && response.endsWith('>') && !response.startsWith('<@')) {
      response = response.slice(1, -1)
    }
    storage.ambientListens[keyword] = {
      response: response,
      user: users[m.user],
      setTime: moment()
    }
    b.reply(m, `${randomInArray(confirmations)} i'll let people know about *${keyword}* if i hear it.`)
  },

  forget: (b, m, t) => {
    if(t in storage.ambientListens) {
      delete storage.ambientListens[t]
      b.reply(m, `r i p ~${t}~`)
    }
    else if(t in storage.directListens) {
      delete storage.directListens[t]
      b.reply(m, `r i p ~${t}~`)
    }
  },

  list: (b, m) => b.reply(m,
    '*ASK ME ABOUT*:\n' +
    Object.keys(storage.directListens).map(kw => `*${kw}*: set by *${storage.directListens[kw].user}* ${storage.directListens[kw].setTime.fromNow()}`).join('\n') +
    '\n\n*IF I HEAR EM*:\n' +
    Object.keys(storage.ambientListens).map(kw => `*${kw}*: set by *${storage.ambientListens[kw].user}* ${storage.ambientListens[kw].setTime.fromNow()}`).join('\n').concat()
  ),

  uptime: (b, m) => {
    const hostname = os.hostname()
    const uptime = moment.duration(process.uptime(), 'seconds').humanize()
    b.reply(m, `hi its me <@${botName}> i have been here for *${uptime}* via \`${hostname}\``)
  },

  repo: (b, m) => b.reply(m, data.repo),

  help: (b, m) => b.reply(m, Object.keys(directCommands).map(c => '`' + c + '`').join(', '))
}

const ambientCommands = {
  '!vidrand': (b, m) => b.reply(m, randomInArray(data.watchlist))
}

controller.hears(
  ['^(.+?)$'],
  ['ambient'],
  (bot, message) => {
    let text = message.text.toLowerCase()

    //Handle ambient commands
    for(const c of Object.keys(ambientCommands)) {
      if(text.startsWith(c)) {
        const textMinusCommand = text.slice(c.length).trim()
        ambientCommands[c](bot, message, textMinusCommand)
        return
      }
    }

    //Handle ambient listens
    for(const l of Object.keys(storage.ambientListens)) {
      if(text.indexOf(l) !== -1) {
        bot.reply(message, storage.ambientListens[l].response)
      }
    }

    let wasMentioned = false
    if(text.startsWith(botName)) {
      text = text.slice(botName.length).trim()
      wasMentioned = true
    }
    else if(text.endsWith(botName)) {
      text = text.slice(0, -botName.length).trim()
      wasMentioned = true
    }

    if(wasMentioned) {
      text = text.trim()
      if(text.length > 0) {
        //Handle commands
        for(const c of Object.keys(directCommands)) {
          if(text.startsWith(c)) {
            const textMinusCommand = text.slice(c.length).trim()
            directCommands[c](bot, message, textMinusCommand)
            return
          }
        }

        //Handle direct listens
        for(const l of Object.keys(storage.directListens)) {
          if(text.startsWith(l)) {
            bot.reply(message, storage.directListens[l].response)
            return
          }
        }
      }

      bot.reply(message, randomInArray(quips))
    }
  }
)



const GoogleSpreadsheet = require('google-spreadsheet')

const doc = new GoogleSpreadsheet(env.GOOGLE_SHEET_ID)
let sheet

const credentials = {
  client_email: env.GOOGLE_CLIENT_EMAIL,
  private_key: env.GOOGLE_PRIVATE_KEY
}

doc.useServiceAccountAuth(credentials, () => {
  doc.getInfo((err, info) => {
    console.log(`Loaded doc '${info.title}' by '${info.author.email}'`)
    console.log('Updated ' + moment(info.updated).fromNow())
    sheet = info.worksheets[0]
    console.log('sheet 1: '+sheet.title+' '+sheet.rowCount+'x'+sheet.colCount)

    sheet.getRows((err, rows) => {
      //{keyword: string, response: string, user: string, created: string}

      // const ambientListens = {}
      // rows.forEach(r => ambientListens[r.keyword] = {
      //   response: r.response,
      //   user: r.user,
      //   created: r.created
      // })

      // rows.forEach(r => r.del(e => console.error(e)))
      
      // console.log('Read ' + rows.length + ' rows')
    })
  })
})
