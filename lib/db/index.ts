import mysql2 from "mysql2/promise";

export async function conn() {
  const conn = await mysql2.createConnection({
    host: `${process.env.DB_HOST}`,
    user: `${process.env.DB_USER}`,
    password: `${process.env.PASSWORD}`,
    database: `${process.env.DB_NAME}`,
  });

  return conn;
}
