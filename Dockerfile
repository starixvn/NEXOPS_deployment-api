FROM hub.nexdev.net/base/node:18.1-buster-slim

USER root

RUN curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 \
    && chmod +x get_helm.sh && ./get_helm.sh \
    && curl -LO https://dl.k8s.io/release/v1.28.3/bin/linux/amd64/kubectl \
    && curl -LO https://dl.k8s.io/release/v1.28.3/bin/linux/amd64/kubectl.sha256 \
    && echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check \
    && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl \
    && kubectl version --client \
    && helm version

# Install self certificates for lumhub.nebula.prod
COPY certs/rootCAnebula.crt /usr/local/share/ca-certificates/rootCAnebula.crt

RUN update-ca-certificates

ENV TZ="America/New_York" \
    NODE_ENV=production

RUN mkdir /app && chown node:node /app

WORKDIR /app
COPY package.json ./
RUN yarn install --production
ENV PATH /app/node_modules/.bin:$PATH
ENV HTTPS_PROXY http://10.148.78.100:8801
ENV https_proxy http://10.148.78.100:8801
ENV HTTP_PROXY http://10.148.78.100:8801
ENV http_proxy http://10.148.78.100:8801
ENV NO_PROXY "172.16.0.1,172.16.0.10,.gamora.prod,localhost,10.148.200.63,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
ENV no_proxy "172.16.0.1,172.16.0.10,.gamora.prod,localhost,10.148.200.63,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

COPY ./src/ .
HEALTHCHECK --interval=10s CMD node --es-module-specifier-resolution=node healthcheck.js

CMD [ "node", "./server.js" ]
