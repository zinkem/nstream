const http = require('http');
const https = require('https');
const { PassThrough, Transform, Duplex } = require('stream');

const NUM_JOBS = 10000;
const HIGH_WATER_MARK = 10;

const proto = (protocol) => {
  if( protocol === 'http:' )
    return http;
  else
    return https;
};

const jsonRequest = (url_string, body) => {
  const opts = new URL(url_string);
  const options = {
    host: opts.hostname,
    port: opts.port,
    path: opts.pathname,
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type':'application/json; charset=UTF-8'
    }
  };
  const client = proto(opts.protocol);

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      const buffer = [];
      res.on('data', (data) => { buffer.push(data.toString('utf8')) } );
      res.on('end', () => {
        resolve(buffer.join(''));
      });
    });

    req.on('error', (err) => {
      reject(new Error(err));
    });

    if(body) req.write(JSON.stringify(body));

    req.end();
  });
}

// Non-Object -> Object Mode
function Parser() {
  return new Transform({
    readableObjectMode: true,
    transform: (data, encoding, cb) => {
      try {
        cb(null, JSON.parse(data));
      } catch (e) {
        cb(new Error(e.message));
      }
    }
  });
}

// Object Mode -> Non Object Mode
function Stringifier() {
  return new Transform({
    writableObjectMode: true,
    transform: (data, encoding, cb) => {
      cb(null, JSON.stringify(data)+'\n');
    }
  });
}

// resource queue is constructed with a configuration
// describing an HTTP POST endpoint
// config => HTTP Options
// POST body --> in --> xform --> out --> POST response
function ResourceQueue(config) {
  return new Transform({
    writableObjectMode: true,
    readableObjectMode: true,
    transform: function(data, encoding, cb) {
      jsonRequest(config, data).then((r) => {
        //console.log(this.writableLength, JSON.stringify(data), r);
        const product = Object.assign(JSON.parse(r), data);
        cb(null, product);
      }).catch((e) => {
        cb(new Error(e.message));
      });
    }
  });
}

function RandomTimeoutQueue(config) {
  let delay = config;

  setInterval(() => {
    delay += Math.floor(Math.random()*10) - 7;
  }, 5000);

  const t = new Transform({
    writableObjectMode: true,
    readableObjectMode: true,
    writableHighWaterMark: HIGH_WATER_MARK,
    readableHighWaterMark: 10, //HIGH_WATER_MARK,
    transform: function(data, encoding, cb) {
      const product = Object.assign({ }, data);
      product.wait = delay;
      if( !product.history ) product.history = [];
      const lb = product.lb === undefined ? 'NA' : product.lb;
      delete product.lb;
      product.history.push([config, product.wait, lb]);
      setTimeout(() => {
        //console.log('delay on ', delay);
        //cb(null, product);
        if( Math.random() > 99 ) {
          t.emit('error', product);
          cb();
        } else
          cb(null, product)

      }, product.wait*Math.random());
    }
  });
  t.type = 'RTQ-'+delay;
  return t;
}

function time(id, instance) {
  const xformFn = instance._transform;

  instance._transform = (data, encoding, cb) => {
    const start = Date.now();
    //console.log(id+' requesting',data)
    xformFn(data, encoding, (err, data) => {
      //console.log(id+' received',data ? data: err);
      data.executiontime = Date.now() - start;
      cb(err, data);
    });
  }

  return instance;
}


// load balancer stream? hmmm...

class LoadBalancer extends Duplex {
  constructor(pool) {
    super({
      writableObjectMode: true,
      readableObjectMode: true,
      writableHighWaterMark: HIGH_WATER_MARK,
      readableHighWaterMark: 15,
    });

    this.pool = pool;
    this.count = 0;
    this.readCount = 0;

    this.pool.forEach((m, i) => {
      m.on('error', (err) => {
        this.emit('error', err);
      });
      m.on('readable', () => {
        //console.log(i, 'readable!', this.isPaused(), m.isPaused());
        //m.resume();
        //console.log(this.readableLength, this.readableHighWaterMark);
        if( this.readableLength < this.readableHighWaterMark )
          this._read(this.readableHighWaterMark);
        //console.log(i, 'readable!', this.isPaused(), m.isPaused());
      });
      /*
      m.on('data', (data) => {
        console.log(i, 'new data!');
        this.push(data);
      });*/
    });
    this.on('pipe', () => {
      this.read(0);
    });
    this.type = 'LB';
  }

  poolSize() {
    return this.pool.length;
  }

  stats() {
    const stats = this.pool.map(p => p.writableLength);
    //console.log('fetching LB stats', stats)
    return stats;
  }

  _write(chunk, encoding, callback) {
    //console.log('loadbalancing to ', count%this.pool.length);
    /*console.log(this.pool.map(x => [x.writable,
                                    x.writableLength,
                                    x.writableHighWaterMark]));
    */
    const route = () => {
      this.count++;
      let member = this.count%this.pool.length;
      if( this.pool[member].writableHighWaterMark <=
          this.pool[member].writableLength )
        return false;

      chunk.lb = member;
      const record = this.pool[member].write(chunk);
      //console.log(member, record);

      callback();
      return true;
    }

    if( !route() ) {
      const poller = setInterval(() => {
        if(route()) clearInterval(poller);
      }, 50);
    }
  }

  _read(size) {
    //console.log('LB READ', size, this.readableFlowing);

    for( let i = 0; i < size; i++ ) {
      if (this.readableLength > this.readableHighWaterMark) return null;
      this.readCount++;
      let member = this.readCount%this.pool.length;
      const r = this.pool[member].read(1);
      //console.log(r);
      if(r)
        this.push(r);
      else break;
    }
  }
}

///


// decorators? hmm
function logger(id, instance) {
  const xformFn = instance._transform;

  instance._transform = (data, encoding, cb) => {
    data.state = 'requesting '+id;
    //console.log(id+' requesting',data)
    xformFn(data, encoding, (err, data) => {
      console.log('LOGGER', err);
      console.log(id+' received',data ? data: err);
      data.state = 'received '+id;
      cb(err, data);
    });
  }

  return instance;
}
//
let count = 0;
// Create pipeline example?
class Pipeline extends Duplex {
  constructor(stages) {
    super({
      readableObjectMode: true,
      writableObjectMode: true
    })
    this.completed = 0;
    this.errors = 0;
    this.inflight = {};
    this.stages = stages
      //.map((x, i) => logger(i, x))
      .map((instance, i) => {
        const xformFn = instance._transform;
        instance._transform = (data, encoding, cb) => {
          this.inflight[data.txid] = data;
          xformFn(data, encoding, (err, data) => {
            if(data)
              this.inflight[data.txid] = data;
            cb(err, data);
          });
        }
        return instance;
      });

    this.stages.forEach((s) => {
      s.on('unpipe', (o) => {
        console.log('unpiped!', o.type, s.type);
        o.pipe(s);
      });
      s.on('error', (err) => {
        this.errors++;
        if( !s.errors ) s.errors = 1;
        else s.errors++;
        this.emit('error', err);
      });
    });

    this.pipeline = stages.reduce((previous, next) => {
      return previous.pipe(next);
    }, new PassThrough());

    // end of the pipeline...
    this.pipeline.on('data', (data) => {
      data.finishtime = Date.now();
      data.elapsedtime = data.finishtime - data.creationtime;
      console.log('job done!', data.txid, this.completed++);

      delete this.inflight[data.txid];
      this.push(data);
    });
  }

  stats() {
    const sum = (a, b) => a + b;
    return [ this.stages.map((x) => x.type === 'LB' ? x.stats().reduce(sum) : x.writableLength),
             this.stages.map(x => x.readableLength) ]
  }

  _write(chunk, encoding, callback) {
    //console.log('new job!',chunk);
    chunk.txid = 10+count++;
    chunk.creationtime = Date.now();
    this.stages[0].write(chunk);
    callback();
  }

  _read(size) {
  }
}
//

const submit = new PassThrough({ writableObjectMode: true, readableObjectMode: true});

const waits1 = [
  [ 11, 1],
  [ 22, ],
  [ 41, 1],
  [ 8, 1],
  [ 231, 2],
  [ 332, 3],
  [ 64, 1],
  [ 622, 6],
  [ 16, 1],
  [ 200, 1],
  [ 41, 1],
  [ 8, 1],
  [ 231, 2],
  [ 332, 3],
  [ 14, 1],
  [ 622, 6],
  [ 16, 1],
  [ 200, 1],
  [ 4, 1],
  [ 11, 1],
  [ 332, 3],
  [ 14, 1],
  [ 128, 2],
  [ 300, 3],
  [ 128, 2],
  [ 64, 1],
  [ 622, 6],
  [ 16, 1],
  [ 200, 1],
  [ 4, 1],
  [ 231, 2],
  [ 332, 3],
  [ 14, 1],
  [ 128, 2],
  [ 300, 3],
  [ 128, 2],
  [ 16, 1],
  [ 200, 1],
  [ 4, 1],
]

const waits = waits1.concat(waits1).concat(waits1).concat(waits1)

const stages = waits.map((x)=> {

  if (x[1] > 1) {
    console.log('load balancer!');
    const resources = [];
    for(let i = 0; i < x[1]; i++)
      resources.push(new RandomTimeoutQueue(x[0]));
    return new LoadBalancer(resources);
  }

  return new RandomTimeoutQueue(x[0])
});

const pipe = new Pipeline(stages);
pipe.on('error', (err) => {
  console.log(`error! ${err.tx} failed at stage ${err.history.length-1}`);
  err.history.reverse().forEach((e) => {
    console.log(`error! undo ${e}`);
  });
});
//pipe.pipe(new Stringifier()).pipe(process.stdout);


const range = (n) => {
  const r = [];
  for( let i = 0; i < n; i++) r.push(i);
  return r;
};

const taskDescriptions = range(NUM_JOBS).map((x) => {
  return {
    tx: x
  }
});

let ramp = 10;
const feed = setInterval(() => {
  try {
    const newjobs = Math.floor(Math.random()*10)-5;
    ramp = ramp + newjobs;
    if( ramp < 0 ) ramp = 0;
    for( let i = 0; i < ramp; i++) {
      pipe.write(taskDescriptions.shift());
    }
  } catch(e) {
    console.log(e);
    clearInterval(feed);
  }
}, 1000);



let aggstats = stages.map(x => 0);
let polls = 0;

let pipelineHistory = [];
const inter = setInterval(() => {
  pipelineHistory.push(pipe.stats());
  if( pipelineHistory > 100 )
    pipelineHistory.unshift();

  const stats = pipe.stats()[0];
  aggstats = stats.map((x, i) => aggstats[i] + x);
  polls++;
  //console.table(pipe.stats().map(x => x.concat([x.reduce((a,b) => a +b) ])));
  //console.log(pipe.inflight);
  if( pipe.stats()[0].reduce((a, b) => a + b) === 0 && taskDescriptions.length === 0) {
    console.log('done!');
    console.log(aggstats);
    console.table({
      wait: waits.map(w => w[0]),
      neck: waits.map((w, i) => Math.round((w[0]/w[1])*NUM_JOBS)),
      agents: stages.map(s => s.poolSize ? s.poolSize() : 1),
      avgqueue: aggstats.map(x => Math.round(x/polls, 0)),
      errors: stages.map(s => s.errors || 0)
    });
    console.log(pipe.completed, pipe.errors);

    clearInterval(inter);
  }
}, 250);

const template = `
      <html>
      <body>
      {{#pipelineHistory}}
      <div style="display: flex;flex-direction: row;">
      {{{row}}}
      </div>
      {{/pipelineHistory}}
      </body>
        </html>
        {{#working}}
        <script>setTimeout(() => { console.log('hi'); location.reload(true); }, 1000);console.log('hi');</script>
        {{/working}}
`;
const end233 =   `  }}   /}}}}`

const mustache = require('mustache');
const httpd = http.createServer((req, res) => {
  const view = {
    pipelineHistory: pipelineHistory.map((x) => {
      return { data: x[0] }
    }),
    row: function() {
      //console.log(this.data);

      return this.data.map((d, i) => {
        const color = ((c) => {
          if(c == 0) return '#00A';
          if(c >= 255) return '#A00';
          const cc = c > 255 ? 255 : c;
          let R = Math.floor( 255-Math.abs(192-c)*1.33 );
          let G = Math.floor( 255-Math.abs(64-cc)*1.30 );

          return '#' + Math.floor(R/16).toString(16) +
            Math.floor(G/16).toString(16) + '0';

          /*
          return c > 192 ? '#A00' :
            c > 128 ? '#FA0' :
            c > 64 ? '#AF0' :
            c > 0 ? '#0F0' :
            '#00A';
            */
        })(Math.floor( (d*255)/HIGH_WATER_MARK ));
        return '<div style="height: 8px; width: 8'+
          'px;background-color:'+color+';border-left:1px;border-color:black;">&nbsp;</div>'
      }).join('');
    }
  };
  res.writeHead(200, {
    'content-type':'text/html'
  });
  res.write(mustache.render(template, view));
  res.end();
});

httpd.listen(8080);
