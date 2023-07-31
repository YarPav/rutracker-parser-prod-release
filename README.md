# **Для работы приложения  необходим VPN!**

# Installation
- Install this project on your machine
- Edit .env file 
- npm install
# Run with docker
- Install this project on your machine
- Edit .env file
- docker build .
- docker-compose up
#
![image](https://github.com/YarPav/rutracker-parser-prod-release/assets/72688237/947b60e8-66d3-4745-b696-ff4a5c9d1433)


Для получение "последних поблагодаривших" нужно отпралять ajax запрос с переданным form_token.
Я не смог найти способа, как получить его, поэтому для получения и последующей записи "последних поблагодаривших" необходимо указать form_token в .env файле, если form_token не указан, в базу будут записаны топики без "последних поблагодаривших". 
   
![image](https://github.com/YarPav/rutracker-parser-prod-release/assets/72688237/f209d752-9313-48c6-8798-25f42214fa69)

