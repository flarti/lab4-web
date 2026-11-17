# Лабораторна робота №5
Деплой застосунку (Express + PostgreSQL) на Render, змінні середовища, моніторинг.

Локально: скопіюйте `.env.example` у `.env`, створіть БД `lab5`, `npm install`, `npm run dev`.
Деплой: завантажте проєкт на GitHub, на Render створіть Blueprint із `render.yaml` або вручну (див. звіт).
Перевірка: `/health`, `/metrics`; навантаження: `npm run loadtest -- https://ВАШ-СЕРВІС.onrender.com/health 100 10`.
