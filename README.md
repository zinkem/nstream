# nstream

`nstream` is a library for working with [Node.js streams](https://nodejs.org/api/stream.html). Streams are an important part of node.js, and many core libraries make use of streams under the hood. The `req` and `res` objects are instances of readable and writable streams, respectively. This is sometimes overlooked in programming APIs that try to mimic node's interface.

# tl;dr

The follow streams are exposed. Each stream may be piped into another and provides a basic set of services for visibility and validation.

- pipeline (same as stream.pipeline)
- LineStream
- Broadcaster
- PassThrough
- WordCounter
- ByteCounter
- FilterStream
- StreamStamper
- ShellStream
- TagParser

# Example grep with streams

```javascript
const { WordCounter,
        FilterStream,
        StreamStamper,
        StreamLines } = require('nstreams');

const proc = require('process');
const fs = require('fs');
const FNAME = './testfile2.txt'


var wc = new WordCounter({});
var filt = new FilterStream({}, proc.argv[2]);
var stamp = new StreamStamper({}, 'out>');
var start_time = proc.hrtime();

var fstream = fs.createReadStream(FNAME);


fstream.pipe(new StreamLines({}))
  .pipe(wc)
  .pipe(filt)
  .pipe(stamp)
  .pipe(proc.stdout);


fstream.on('close', () => {
  setTimeout(() => {
    proc.stdout.write('\n'+ proc.hrtime(start_time)+
                      ' words '+wc.count+'\n'+
                     ' lines ' + filt.found +'\n')
  }, 1000);

});
```
