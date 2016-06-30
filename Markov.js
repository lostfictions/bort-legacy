//Adapted from https://github.com/swang/markovchain
'use strict' //eslint-disable-line

function randomInArray(arr) { return arr[Math.floor(Math.random() * arr.length)] }


function randomByWeight(weights) {
  const keys = Object.keys(weights)
  const sum = keys.reduce((p, c) => p + weights[c], 0)
  if (!Number.isFinite(sum)) {
    throw new Error("All values in object must be a numeric value")
  }
  const choose = Math.floor(Math.random() * sum)
  for (let i = 0, count = 0; i < keys.length; i++) {
    count += weights[keys[i]]
    if (count > choose) {
      return keys[i]
    }
  }
  throw new Error('We goofed!')  
}

const prepositions = [
  'until', 'onto', 'of', 'into', 'out', 'except',
  'across', 'by', 'between', 'at', 'down', 'as', 'from', 'around', 'with',
  'among', 'upon', 'amid', 'to', 'along', 'since', 'about', 'off', 'on',
  'within', 'in', 'during', 'per', 'without', 'throughout', 'through', 'than',
  'via', 'up', 'unlike', 'despite', 'below', 'unless', 'towards', 'besides',
  'after', 'whereas', '\'o', 'amidst', 'amongst', 'apropos', 'atop', 'barring',
  'chez', 'circa', 'mid', 'midst', 'notwithstanding', 'qua', 'sans',
  'vis-a-vis', 'thru', 'till', 'versus', 'without', 'w/o', 'o\'', 'a\''
]

const determiners = [
  'this', 'any', 'enough', 'each', 'whatever', 'every', 'these', 'another',
  'plenty', 'whichever', 'neither', 'an', 'a', 'least', 'own', 'few', 'both',
  'those', 'the', 'that', 'various', 'either', 'much', 'some', 'else', 'no',
  'la', 'le', 'les', 'des', 'de', 'du', 'el'
]

const conjunctions = [
  'yet', 'therefore', 'or', 'while', 'nor', 'whether',
  'though', 'because', 'cuz', 'but', 'for', 'and', 'however', 'before',
  'although', 'how', 'plus', 'versus', 'not' ]

const misc = [
  'if', 'unless', 'otherwise', 'notwithstanding', 'said', 'had',
  'been', 'began', 'came', 'did', 'meant', 'went', 'is', 'will be', 'are', 'was',
  'were', 'am', 'isn\'t', 'ain\'t', 'aren\'t', 'can', 'may', 'could', 'might',
  'will', 'ought to', 'would', 'must', 'shall', 'should', 'ought', 'shant',
  'lets', 'his', 'her', 'my', 'their', 'yours', 'your', 'our', 'its', 'it',
  'they', 'i', 'them', 'you', 'she', 'me', 'he', 'him', 'ourselves', 'us', 'we',
  'thou', 'il', 'elle', 'yourself', '\'em', 'he\'s', 'she\'s', 'where', 'why',
  'when', 'who', 'whom', 'whose', 'what', 'which'
]

const continueSet = new Set(prepositions.concat(determiners).concat(conjunctions).concat(misc))

class MarkovChain {
  constructor(contents, normalizer = (word) => word.replace(/\.$/ig, '')) {
    this.wordBank = {}
    this.normalizer = normalizer
    this.splitter = /(?:\.|\?|\n)/ig
    this.add(contents)
  }

  getSeed(wordList) {
    return randomInArray(Object.keys(wordList))
  }

  endTest(sentence) {
    return sentence.length > 7 && !continueSet.has(sentence[sentence.length - 1]) && Math.random() > 0.7
  }

  get(seed = this.getSeed(this.wordBank)) {
    if(!this.wordBank[seed]) {
      return ''
    }

    let word = seed
    const sentence = [word]
    while(this.wordBank[word] && !this.endTest(sentence)) {
      word = randomByWeight(this.wordBank[word])
      sentence.push(word)
    }
    return sentence.join(' ')
  }

  add(text = '', splitter = this.splitter) {
    text.split(splitter).forEach(line => {
      const words = line.split(' ').filter((w) => { return w.trim() !== '' })
      for (let i = 0; i < words.length - 1; i++) {
        const curWord = this.normalizer(words[i])
        const nextWord = this.normalizer(words[i + 1])

        if (!this.wordBank[curWord]) {
          this.wordBank[curWord] = {}
        }

        if (!this.wordBank[curWord][nextWord]) {
          this.wordBank[curWord][nextWord] = 1
        }
        else {
          this.wordBank[curWord][nextWord] += 1
        }
      }
    })
    return this
  }

  dump() {
    return JSON.stringify(this.wordBank)
  }

  setSeedGetter(functionOrString) {
    if (typeof functionOrString === 'string') {
      this.getSeed = () => functionOrString
    }
    else if (typeof functionOrString === 'function') {
      this.getSeed = (wordList) => functionOrString(wordList)
    }
    else {
      throw new Error('Must pass a function or string into setStart()')
    }
    return this
  }

  setEndTest(functionOrStringOrNumber) {
    if (typeof functionOrStringOrNumber === 'function') {
      this.endTest = () => functionOrStringOrNumber(this.sentence)
    }
    else if (typeof functionOrStringOrNumber === 'string') {
      this.endTest = () => this.sentence.split(' ').slice(-1)[0] === functionOrStringOrNumber
    }
    else if (typeof functionOrStringOrNumber === 'number' || functionOrStringOrNumber == null) {
      functionOrStringOrNumber = functionOrStringOrNumber || Infinity //eslint-disable-line no-param-reassign
      this.endTest = () => this.sentence.split(' ').length > functionOrStringOrNumber
    }
    else {
      throw new Error('Must pass a function, string or number into setEnd()')
    }
    return this
  }
}

module.exports = MarkovChain
