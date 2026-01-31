# Nomad Dance Academy

Описание здесь

## Launch

Установите Yarn

```bash
npm install -g yarn
```

Клонируйте репозиторий и установите зависимости:

```bash
git clone https://github.com/Sultan-IT-Solutions/Nomad-Dance-Academy.git
cd sits

yarn install
```

Создайте `.env` файлы для клиента и админки:

**`packages/backend/.env`**

```dotenv
PORT=3333
DB_URL=mongodb+srv://...
JWT_SECRET=super-secret-key
JWT_LIFETIME=15d
FRONTEND_ORIGINS=http://localhost:3000,http://192.168.31.27:3000...
```

## Development

Запуск в режиме разработки (одновременно клиент и админка):

```bash
yarn dev
```

Сборка проекта:

```bash
yarn build
```

Запуск в production:

```bash
yarn start
```

Очистка кэша и сборок:

```bash
yarn clean
```