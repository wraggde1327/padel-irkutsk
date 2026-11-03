# Падел-турнир, Иркутск

Telegram Mini App для месячного падел-турнира на трёх площадках: регистрация пар и одиночек, квалификация, три дивизиона, плей-офф, финалы офлайн.

Сейчас закрыты **этап 0** (макеты) и **этап 1** (каркас, вход, админка настроек).

## Что в репозитории

| Путь | Что это |
|---|---|
| `cursor_spec.md` | Полное ТЗ: стек, этапы, экраны, Prisma, API, оплата |
| `design/mockups` | Макеты шести экранов в рамке телефона (этап 0) |
| `design/PLAN.md` | План кадров |
| `design/tokens.md` | Цвета, кегли, цели касания → будущие CSS-переменные |
| `design/REVIEW.md` | Проверка макетов по §4 |
| `design/screens/` | Скриншоты светлой и тёмной темы |
| `demo/` | Кликабельный прототип на тестовых данных (не боевой код) |
| `apps/api/prisma/schema.prisma` | Схема БД (Prisma 6) |
| `.cursor/rules/project.mdc` | Правила для Cursor |

Клубы, партнёры и фамилии в макетах — заглушки. Реальные названия вносит администратор.

## Запуск приложения

```bash
# Postgres: docker compose up -d
# или локальный PostgreSQL 16 с DATABASE_URL из .env.example
cp .env.example .env
pnpm install
pnpm --filter api exec prisma migrate dev --name init
pnpm --filter api db:seed
pnpm dev    # API :4822 и Mini App :4174
```

Игрок: http://127.0.0.1:4174  
Админка: http://127.0.0.1:4174/admin (после входа с ролью ADMIN/OWNER).

Локально без Telegram можно включить `ALLOW_DEV_LOGIN=true` и войти с экрана профиля. В проде это выключено.

## Макеты (этап 0)

```bash
pnpm install
pnpm --filter mockups dev    # http://localhost:4821
pnpm --filter mockups build
```

На обзоре шесть телефонов рядом и переключатель темы. Один экран: `/?screen=home&theme=dark` (`home`, `register`, `matches`, `table`, `bracket`, `profile`).

## Демо-прототип

```bash
pnpm --filter padel-tma-demo dev
```

## Правила

- Секреты только в `.env`. Шаблон — `.env.example`.
- Интерфейс на русском. Названия клубов и спонсоров не выдумываем.
- Этап 1 не начинаем без «ок» по макетам.

Открытые вопросы к заказчику — `cursor_spec.md` §14. Пока работаем по допущениям A1–A14.
