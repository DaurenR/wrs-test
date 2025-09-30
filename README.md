# Bitrix24 Warehouse Robot Service


Единый HTTP-эндпоинт для роботов CRM Bitrix24 (Automation rules), который выполняет складские операции по товарным строкам элемента (Сделка/SPA).


## Запуск
```bash
npm i
cp .env.example .env
# пропиши B24_WEBHOOK_URL
npm run dev
```
Сервис поднимется на `http://localhost:3000` и будет слушать роут `/robots/process_docs_external`.


## Примеры вызовов (все параметры — в query string)
### Приход (Сделка)
```bash
curl -X POST "http://localhost:3000/robots/process_docs_external?elemId=501&ownerTypeShort=D&docType=A&storeId=3&responsibleId=777&comment=Receipt%20via%20robot"
```


### Списание (SPA)
```bash
curl -X POST "http://localhost:3000/robots/process_docs_external?elemId=777&elemType=S&spaTypeId=1068&docType=D&storeId=2"
```


### Перемещение (Сделка)
```bash
curl -X POST "http://localhost:3000/robots/process_docs_external?elemId=888&ownerTypeShort=D&docType=M&storeFrom=1&storeTo=2&comment=Move"
```


## Параметры URL (кратко)
- `elemId` — ID элемента (обяз.)
- Владелец (два способа; приоритет у краткого):
- `ownerTypeShort`=`D|S` (D=Сделка, S=SPA)
- или `elemType=S` + `spaTypeId=<entityTypeId>`
- `docType`=`A|D|M`
- Склады:
- `storeId` (для A/D)
- `storeFrom` + `storeTo` (для M)
- `responsibleId`, `comment` — опционально
- `ts`, `sig` — опционально (подпись HMAC)


## Ответы
Успех:
```json
{"status":"ok","owner":"deal","elemId":501,"docType":"A","stores":{"id":3},"rowsFound":3,"rowsProcessed":3,"message":"Document created: 123"}
```
Ошибка 400/404/500:
```json
{"status":"error","code":400,"message":"storeFrom and storeTo are required for docType=M"}
```


## Подключение робота Bitrix24
Нужны **исходящий вебхук** (робот вызывает наш сервис) и **входящий вебхук** (наш сервис обращается к REST Bitrix24 через `B24_WEBHOOK_URL`).


## Логи
Pino: дата, маршрут, docType, владелец и ID, склады, количество строк, итог.