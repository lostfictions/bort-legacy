'use strict' //eslint-disable-line

const envalid = require('envalid')
const env = envalid.cleanEnv(process.env, {
  SLACK_TOKEN: envalid.str(),
  GOOGLE_PRIVATE_KEY: envalid.str(),
  GOOGLE_CLIENT_EMAIL: envalid.email(),
  GOOGLE_SHEET_ID: envalid.str(),
  OPENSHIFT_NODEJS_PORT: envalid.num({ default: 8080 }),
  OPENSHIFT_NODEJS_IP: envalid.str({ default: 'localhost' }),
  SLASH_VERIFICATION_TOKEN: envalid.str()
})

const fs = require('fs')
const os = require('os')

const botkit = require('botkit')
const moment = require('moment')
const _ = require('lodash')
const async = require('async')
const GoogleSpreadsheet = require('google-spreadsheet')
const syllable = require('syllable')
const pronouncing = require('pronouncing')

const Markov = require('./Markov')

const convoMarkov = new Markov()

//Open a responder we can ping (via uptimerobot.com or similar) so the OpenShift app doesn't idle
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

const interjections = [
  'gosh',
  'dang',
  'man',
  'jeez louise',
  'oh boy',
  'phew'
]

const vidlines = {
  "i'm just so tired of": {
    singular: "this",
    plural: "these",
    indefinite: "",
    adjecting: "being"
  },
  "i'm pretty excited to finally": {
    singular: "find that",
    plural: "find those",
    indefinite: "stop",
    adjecting: "get"
  }
}


const staticData = {
  repo: 'https://github.com/lostfictions/bort',
  watchlist: fs.readFileSync('data/vidnite_links.txt').toString().split('\n'),
  watched: require('./data/watched.json'),
  vidlineVids: {}
}
for(const type of Object.keys(staticData.watched)) {
  staticData.watched[type].forEach(vid => { staticData.vidlineVids[vid] = type })
}

//Each storage category is keyed by the first key in the schema
const storageSchema = {
  directListens: {
    keyword: true,
    response: true,
    user: true,
    created: true
  },
  ambientListens: {
    keyword: true,
    response: true,
    user: true,
    created: true
  }
}

const storage = {}

let botName
const users = {}

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
    botName = payload.self.name
    payload.users.forEach(u => users[u.id] = u.name) //eslint-disable-line no-return-assign
    const channels = payload.channels.filter(c => c.is_member && !c.is_archived)
    channels.forEach(c => bot.say({
      text: randomInArray(greetz) + ' (`' + os.hostname() + '`)',
      channel: c.id
    }))
  }
})

const listenRegex = /([\w\W]+)\s+?(?:is|equals|means)\s+?([\w\W]+)/i

const directCommands = {
  remember: (b, m, t) => {
    const matches = t.match(listenRegex)
    if(matches === null) {
      b.reply(m, "I CAN'T REMEMBER THIS")
      return
    }
    const keyword = _.trimStart(matches[1], ',.! \t').trim()
    if(keyword.length < 1) {
      b.reply(m, "I CAN'T REMEMBER THIS")
      return
    }
    let response = matches[2]
    //FIXME: not robust sanitization!
    if(response.startsWith('<') && response.endsWith('>') && !response.startsWith('<@')) {
      response = response.slice(1, -1)
    }
    storage.directListens[keyword] = {
      keyword: keyword,
      response: response,
      user: users[m.user],
      created: moment().toISOString()
    }
    b.reply(m, `${randomInArray(confirmations)} if anyone asks me about *${keyword}* i'll be sure to let them know the truth.`)
  },

  listen: (b, m, t) => {
    const matches = t.match(listenRegex)
    if(matches === null) {
      b.reply(m, "I CAN'T HEAR YOU")
      return
    }
    const keyword = _.trimStart(matches[1], ',.! \t').trim()
    if(keyword.length < 1) {
      b.reply(m, "I CAN'T HEAR YOU")
      return
    }
    let response = matches[2]
    if(response.startsWith('<') && response.endsWith('>') && !response.startsWith('<@')) {
      response = response.slice(1, -1)
    }
    storage.ambientListens[keyword] = {
      keyword: keyword,
      response: response,
      user: users[m.user],
      created: moment().toISOString()
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

  rhyme: (b, m, t) => {
    let originalPhrase = t
    let includeOriginalPhrase = false

    if(originalPhrase.length === 0) {
      originalPhrase = convoMarkov.get()
      if(originalPhrase.length === 0) {
        originalPhrase = randomInArray(greetz.concat(confirmations).concat(quips))
      }
      includeOriginalPhrase = true
    }

    const words = originalPhrase.split(' ')

    let newPhraseSeed = convoMarkov.get()
    if(newPhraseSeed.length === 0) {
      newPhraseSeed = randomInArray(greetz.concat(confirmations).concat(quips))
    }

    const newWords = newPhraseSeed.split(' ')

    let rhymes
    let i
    for(i = words.length - 1; i >= 0; i--) {
      rhymes = pronouncing.rhymes(words[i])
      if(rhymes.length > 0) {
        break
      }
    }

    if(rhymes.length === 0) {
      b.reply(m, randomInArray(["can't do it / so screw it", "i choked :(", "rap sucks", "go fucking read a sonnet"]))
      return
    }

    const syllableCount = syllable(words[i])
    const rhymesSameSyllableCount = rhymes.filter(r => syllable(r) === syllableCount)
    if(rhymesSameSyllableCount.length > 0) {
      newWords[newWords.length - 1] = randomInArray(rhymesSameSyllableCount)
    }
    else {
      newWords[newWords.length - 1] = randomInArray(rhymes)
    }

    let reply = newWords.join(' ')
    if(includeOriginalPhrase) {
      reply = originalPhrase + ' / ' + reply
    }
    b.reply(m, reply)
  },

  list: (b, m) => b.reply(m,
    '*ASK ME ABOUT*:\n' +
    Object.keys(storage.directListens || {})
      .map(kw =>
        `*${kw}*: set by *${storage.directListens[kw].user}* ${moment(storage.directListens[kw].created).fromNow()}`)
      .join('\n') +
    '\n\n*IF I HEAR EM*:\n' +
    Object.keys(storage.ambientListens || {})
      .map(kw =>
        `*${kw}*: set by *${storage.ambientListens[kw].user}* ${moment(storage.ambientListens[kw].created).fromNow()}`)
      .join('\n')
  ),

  uptime: (b, m) => {
    const hostname = os.hostname()
    const uptime = moment.duration(process.uptime(), 'seconds').humanize()
    b.reply(m, `hi its me <@${botName}> i have been here for *${uptime}* via \`${hostname}\``)
  },

  repo: (b, m) => b.reply(m, staticData.repo),

  help: (b, m) => b.reply(m, Object.keys(directCommands).map(c => '`' + c + '`').join(', '))
}

const ambientCommands = {
  '!vidrand': (b, m) => b.reply(m, randomInArray(staticData.watchlist)),
  '!vidline': (b, m) => {
    const int = randomInArray(interjections)
    const line = randomInArray(Object.keys(vidlines))
    const vid = randomInArray(Object.keys(staticData.vidlineVids))
    const joiner = vidlines[line][staticData.vidlineVids[vid]]
    b.reply(m, `${int}, ${line} ${joiner} ${vid}`)
  }
}

controller.on('slash_command', function(bot, message) {
  if(message.command === "/i") {
    if(message.token !== env.SLASH_VERIFICATION_TOKEN) {
      console.warn(`Invalid verification token on request: ${message.token}`)
      return
    }
    if(message.text === "") {
      bot.replyPrivate(
        message,
        "You need to tell me what you're doing!"
      )
      return
    }

    bot.replyPublic(message, `*${message.user}* _${message.text}_`)
  }
})

controller.hears(
  [/^(.+?)$/mig],
  ['ambient'],
  (bot, message) => {
    const text = message.text.toLowerCase()

    //Handle ambient commands
    for(const c of Object.keys(ambientCommands)) {
      if(text.startsWith(c)) {
        const textMinusCommand = text.slice(c.length).trim()
        ambientCommands[c](bot, message, textMinusCommand)
        return
      }
    }

    let didReply = false
    //Handle ambient listens
    for(const l of Object.keys(storage.ambientListens)) {
      if(text.indexOf(l) !== -1) {
        bot.reply(message, storage.ambientListens[l].response)
        didReply = true
      }
    }

    let shouldCheckCommandsAndListens = false
    let textMinusBot
    if(text.startsWith(botName)) {
      textMinusBot = text.slice(botName.length).trim()
      shouldCheckCommandsAndListens = true
    }
    else if(text.endsWith(botName)) {
      textMinusBot = text.slice(0, -botName.length).trim()
      shouldCheckCommandsAndListens = true
    }

    if(shouldCheckCommandsAndListens) {
      if(textMinusBot.length > 0) {
        //Handle commands
        for(const c of Object.keys(directCommands)) {
          if(textMinusBot.startsWith(c)) {
            const textMinusCommand = textMinusBot.slice(c.length).trim()
            directCommands[c](bot, message, textMinusCommand)
            return
          }
        }

        //Handle direct listens
        for(const l of Object.keys(storage.directListens)) {
          if(textMinusBot.startsWith(l)) {
            bot.reply(message, storage.directListens[l].response)
            return
          }
        }
      }
    }

    convoMarkov.add(text)

    //if the bot already replied to one or more ambient listens,
    //don't bother seeing if we need to try to write more
    if(!didReply && text.indexOf(botName) !== -1) {
      const words = text.split(' ')

      let reply = ''

      // only use a word from what we heard as seed if
      // we heard something more than the bot name
      if(words.length > 1) {
        if(Math.random() < 0.1) {
          directCommands.rhyme(bot, message, text)
          return
        }
        reply = convoMarkov.get(words[words.length - 1])
      }

      if(reply.length === 0) {
        reply = convoMarkov.get()
      }
      if(reply.length === 0) {
        reply = randomInArray(quips)
      }
      bot.reply(message, reply)
    }
  }
)


//TODO: split saving/loading off into separate module maybe

// const doc = new GoogleSpreadsheet(env.GOOGLE_SHEET_ID)
// let sheet

// const credentials = {
//   client_email: env.GOOGLE_CLIENT_EMAIL,
//   private_key: env.GOOGLE_PRIVATE_KEY
// }

// doc.useServiceAccountAuth(credentials, () => {
//   doc.getInfo((err, info) => {
//     if(err) {
//       console.error(err)
//     }
//     else {
//       sheet = info
//       retrieveData()
//     }
//   })
// })

// function retrieveData() {
//   for(const category of Object.keys(storageSchema)) {
//     const categoryKeys = Object.keys(storageSchema[category])

//     const worksheet = sheet.worksheets.find(w => w.title === category)
//     if(worksheet == null) {
//       console.error(`Can't get worksheet '${category}'! Creating it.`)
//       sheet.addWorksheet(
//         {
//           title: category,
//           rowCount: 5, //needs some padding, api forbids deleting all rows
//           colCount: categoryKeys.length,
//           headers: categoryKeys
//         },
//         e => { if(e) { console.error('Error creating new worksheet for ' + category + ': ' + e) } }
//       )
//     }
//     else {
//       worksheet.getRows((err, rows) => {
//         storage[category] = {}
//         rows.forEach(r => {
//           //Index each storage category by the first key in the schema
//           const index = r[categoryKeys[0]]
//           storage[category][index] = {}
//           categoryKeys.forEach(k => { storage[category][index][k] = r[k] })
//         })
//       })
//     }
//   }
// }

// function saveData() {
//   async.series(
//     Object.keys(storage).map(category => {
//       return function(outercb) {
//         const worksheet = sheet.worksheets.find(w => w.title === category)
//         if(worksheet == null) {
//           outercb(`Can't get worksheet '${category}'`)
//           return
//         }
//         async.waterfall(
//           [
//             (cb) => worksheet.getRows(cb),
//             (rows, cb) => async.parallelLimit(rows.map(r => r.del), 2, e => cb(e)),
//             (cb) => async.parallelLimit(
//               Object.keys(storage[category]).map(k =>
//                 worksheet.addRow.bind(undefined, _.pick(storage[category][k], Object.keys(storageSchema[category])))
//               ),
//               2,
//               cb
//             )
//           ],
//           outercb
//         )
//       }
//     }),
//     (err) => {
//       if(err) {
//         console.error(err)
//       }
//       else {
//         console.log('Saved to Sheets successfully at ' + moment().format('dddd, MMMM Do YYYY, h:mm:ss a'))
//       }
//     }
//   )
// }

// setInterval(saveData, moment.duration(10, 'minutes').asMilliseconds())

//setInterval(() => console.log(convoMarkov.dump()), moment.duration(10, 'minutes').asMilliseconds())


/*
 * Pass an array of tuples like [['dog', 1],['cat', 2]] and it'll
 * return you a function that, when called, will give you a random
 * value based on the given weights (eg. 'dog' 1 time out of 3,
 * 'cat' 2 times out of 3)
 */
// function makeWeightedGetter(weights) {
//   const totalWeight = weights.reduce((p, c) => p + c[1], 0)

//   let lastWeight = 0
//   for(let i=0; i<weights.length; i++) {
//     const w = weights[i]
//     w[1] = w[1] / totalWeight + lastWeight
//     lastWeight = w[1]
//   }

//   //Set the final weight to exactly one
//   weights[weights.length-1][1] = 1

//   return () => {
//     const rr = Math.random()
//     for(let i=0; i<weights.length; i++) {
//       const w = weights[i]
//       if(rr < w[1]) {
//         return w[0]
//       }
//     }
//     throw new Error('We goofed!')
//   }
// }

