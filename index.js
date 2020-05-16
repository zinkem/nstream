const { pipeline } = require('stream');
const { LineStream } = require('./lib/linestream.js');
const { Broadcaster,
        PassThrough,
        WordCounter,
        ByteCounter,
        FilterStream,
        StreamStamper,
        ShellStream,
        TagParser } = require('./lib/streams.js');

module.exports = {
  pipeline,
  LineStream,
  Broadcaster,
  PassThrough,
  WordCounter,
  ByteCounter,
  FilterStream,
  StreamStamper,
  ShellStream,
  TagParser
}
