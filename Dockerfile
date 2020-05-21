FROM node as nstream_dependencies
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci

FROM nstream_dependencies as nstream
COPY lib/ lib/
COPY index.js ./
COPY bin/ bin/
COPY server.js ./
CMD npm start
