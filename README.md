# itsm-workflows-bpmn
A backend execution engine for the ITSM-NG workflow plugin

## Installation

### Requirements

* Node.js >= 10.x
* NPM >= 6.x
* MongoDB >= 4.x

### Installation in Debian
* Download .deb in [release](https://github.com/itsmng/itsm-workflows-bpmn/releases)
* Install the deb with this command:
    ```bash
    apt install ./itsmng-workflows_*_all.deb
    ```
* Edit the configuration in ***/etc/itsmng-workflows/configuration***
* Restart BPMN server (systemctl restart itsmng-workflows.service)

### Install from Docker
```yaml
  mongo:
   image: mongo
   ports:
     - 27017:27017
    
  bpmn-server:
    image: ghcr.io/itsmng/itsm-workflows-bpmn:latest
    container_name: bpmn-server
    depends_on:
      - mongo
    environment:
      ITSM_HOST: "https://itsm-ng.lan"
      ITSM_URI: 
      ITSM_APP_TOKEN: "yeJVsyTJzoJgCcccccccwVkSM9DVNrp9emr"
      ITSM_USER_TOKEN: "J1073HvGtccccccccccccU0Ci22bZj9Rb83mYPv1"
      MONGO_DB_URL: "mongodb://mongo:27017/bpmn"
    ports:
     - 3000:3000
    restart: always
```

### Installation from source
Setup .env with your mongodb connection string like so:

```bash
# PORT # for express application
PORT=3000

#API_KEY is used for remote access
API_KEY=12345

# MongoDB Settings
MONGO_DB_URL=mongodb://0.0.0.0:27017/bpmn
#
... more settings
```
Install dependencies
```bash
git clone https://github.com/bpmnServer/bpmn-web.git

npm install

npm run setup
```

## Usage
Start the server with the following command:
```bash
npm start
```
