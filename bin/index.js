'use strict';

const net = require('net');
const fs = require('fs');
const { Broadcaster,
        PassThrough,
        WordCounter,
        ByteCounter,
        FilterStream,
        StreamStamper,
        ShellStream } = require('./streams.js');
const { Writable } = require('stream');


var broadcast = new PassThrough({ });
broadcast.setMaxListeners(10000);

var output_file = fs.createWriteStream('./output.txt');
broadcast.pipe(output_file);

var counter = 0;
var server = net.createServer((socket) => {
  var id = counter++;

  console.log('new client', id);//, socket);
  broadcast.write('new client ' + id + '\n');

  var wc = new WordCounter();
  var bc = new ByteCounter();
  var filter1 = new FilterStream({ invert_match: false }, ':');
  // this is a profanity filter!
  var filter2 = new FilterStream({ invert_match: true }, 'fuck');

  var printStats = () => {
    console.log(wc.count, 'words');
    console.log(bc.count, 'bytes');
    console.log(filter1.lines, 'recieved messages');
    console.log(filter1.found, 'broadcast messages');
    console.log(filter2.lines - filter2.found, 'filtered messages');
  }

  socket.on('error', (err) => {
    console.log(id, 'terminated with error', err);
  });

  socket.on('end', () => {
    console.log(id, 'terminated normally');
  });

  socket.on('close', () => {
    console.log(id, 'close event');
    broadcast.write('client ' + id + ' disconnected\n');
    printStats();
  });

  socket.write(id + ' Hello, Welcome to Broadcast... ' +
               broadcast.listenerCount('data') + ' listeners\r\n');


  //chat/broadcast pipeline...
  // filter 1 broadcasts messageswith ":'
  // filter 2 filters out profanity
  // stream stamper adds client id
  // broadcast sends data to all pipes
  socket.pipe(wc)
    .pipe(bc)
    .pipe(filter1)
    .pipe(filter2)
    .pipe(new StreamStamper({}, 'client'+id))
    .pipe(broadcast, { end: false });
  broadcast.pipe(socket);

  //first we filter out the ':' messages
  // then execute commands via shell stream
  socket.pipe(new FilterStream({ invert_match: true }, ':'))
    .pipe(new ShellStream({}))
    .pipe(socket);

});

server.on('error', (err) => {
  console.log('server', err);
});

server.listen(1337, 'localhost');
console.log(server)


const http = require('http');


var hs = http.createServer((req, res) => {

  console.log(req.url);
  console.log('sup');
  var ss = new ShellStream({});
  ss.pipe(new Writable({
    write(d, e, c) {
      console.log('---',d.toString(),'---');
      res.write(d.toString());
      c();
    }
  }));

  ss.write('find /\n');

});

hs.listen(8000);
