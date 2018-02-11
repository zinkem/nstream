'use strict';

const { WordCounter,
        FilterStream,
        StreamStamper,
        StreamLines } = require('./streams.js');

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
