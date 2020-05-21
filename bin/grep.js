'use strict';

const { WordCounter,
        FilterStream,
        StreamStamper,
        LineStream } = require('..');

const proc = require('process');
const fs = require('fs');
const FNAME = proc.argv.pop();


var wc = new WordCounter({});
var filt = new FilterStream({}, proc.argv[2]);
var stamp = new StreamStamper({}, `\n${FNAME}`);
var start_time = proc.hrtime();

var fstream = fs.createReadStream(FNAME);


fstream.pipe(new LineStream({}))
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
