import express from "express";
import passport from "passport";
import multer from "multer";
import * as path from "path";
import { conn } from "../../lib/db";
import { body, param, query, validationResult } from "express-validator";
import { findChangedValues, isAdmin } from "../../lib/utils.ts";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const route = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "img/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (ACCEPTED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File must be in .jpg, .jpeg, .png and .webp format"));
    }
  },
});

route.get(
  "/all",
  passport.authenticate("jwt", { session: false }),
  async (req: any, res) => {
    const { limit: queryLimit } = req.query;

    const db = await conn();

    try {
      let query =
        "SELECT p.id, p.name, p.description, pr.price, p.stock, p.thumbnail, GROUP_CONCAT(c.name SEPARATOR ', ') AS category FROM products p LEFT JOIN product_category pc ON p.id = pc.product_id LEFT JOIN category c ON pc.category_id = c.id JOIN price pr ON p.price_id = pr.id GROUP BY p.id";

      const params = [];

      const limit = parseInt(queryLimit, 10);
      if (!isNaN(limit) && limit > 0) {
        query += " LIMIT ?";
        params.push(limit);
      }

      const [products]: any = await db.execute(query, params);

      return res.status(200).json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Error fetching products" }] });
    } finally {
      await db.end();
    }
  }
);

route.get(
  "/search",
  passport.authenticate("jwt", { session: false }),
  query("q").isString().notEmpty(),
  async (req: any, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }

    const { q: query } = req.query;

    const db = await conn();

    try {
      const [products]: any = await db.execute(
        "SELECT p.id, p.name, p.description, pr.price, p.stock, p.thumbnail, (SELECT GROUP_CONCAT(c.name SEPARATOR ', ') FROM product_category pc JOIN category c ON pc.category_id = c.id WHERE pc.product_id = p.id) AS category FROM products p JOIN price pr ON p.price_id = pr.id WHERE p.name LIKE ?",
        [`%${query}%`]
      );

      if (!products[0]) {
        return res.status(404).json({ errors: [{ msg: "Product not found" }] });
      }

      return res.status(200).json(products);
    } catch (error) {
      console.error("Error fetching product:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Error fetching product" }] });
    } finally {
      await db.end();
    }
  }
);

route.get(
  "/get/:id",
  passport.authenticate("jwt", { session: false }),
  param("id").isInt().notEmpty(),
  async (req: any, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }

    const { id } = req.params;

    const db = await conn();

    try {
      const [product]: any = await db.execute(
        "SELECT p.id, p.name, p.description, pr.price, p.stock, p.thumbnail, (SELECT GROUP_CONCAT(c.name SEPARATOR ', ') FROM product_category pc JOIN category c ON pc.category_id = c.id WHERE pc.product_id = p.id) AS category FROM products p JOIN price pr ON p.price_id = pr.id WHERE p.id = ?",
        [id]
      );

      if (!product[0]) {
        return res.status(404).json({ errors: [{ msg: "Product not found" }] });
      }

      return res.status(200).json(product[0]);
    } catch (error) {
      console.error("Error fetching product:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Error fetching product" }] });
    } finally {
      await db.end();
    }
  }
);
route.get(
  "/category/:categoryName",
  passport.authenticate("jwt", { session: false }),
  param("categoryName").isString().notEmpty(),
  async (req: any, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }

    const db = await conn();

    try {
      const { categoryName } = req.params;

      const [products]: any = await db.execute(
        "SELECT p.id, p.name, p.description, pr.price, p.stock, p.thumbnail, c.name AS category FROM products p JOIN product_category pc ON p.id = pc.product_id JOIN category c ON pc.category_id = c.id JOIN price pr ON p.price_id = pr.id WHERE c.name = ?;",
        [categoryName]
      );

      if (!products || products.length === 0) {
        return res
          .status(404)
          .json({ errors: [{ msg: "No products found for the category" }] });
      }

      return res.status(200).json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Error fetching products" }] });
    } finally {
      await db.end();
    }
  }
);

route.put(
  "/update",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  body("id").isInt(),
  body("name").isString(),
  body("category").isString(),
  body("price")
    .isNumeric()
    .isLength({ min: 1, max: 6 })
    .custom((value) => value >= 0),
  body("stock")
    .isNumeric()
    .isLength({ min: 1, max: 3 })
    .custom((value) => value >= 0),
  body("description").isString(),
  async (req: any, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }

    const db = await conn();

    try {
      await db.beginTransaction();

      const { id, category, price, ...updatedFields } = req.body;

      const [product]: any = await db.execute(
        "SELECT p.id, p.name, p.description, p.price_id, p.stock, (SELECT GROUP_CONCAT(c.name SEPARATOR ', ') FROM product_category pc JOIN category c ON pc.category_id = c.id WHERE pc.product_id = p.id) AS category_names FROM products p WHERE p.id = ? FOR UPDATE",
        [id]
      );

      if (!product[0]) {
        return res.status(404).json({ errors: [{ msg: "Product not found" }] });
      }

      const changedValues = findChangedValues(product[0], updatedFields);

      if (category) {
        await db.execute("DELETE FROM product_category WHERE product_id = ?", [
          id,
        ]);

        const categoryIds: number[] = await Promise.all(
          category.split(",").map(async (catName: string) => {
            const [categoryResult]: any = await db.execute(
              "SELECT id FROM category WHERE name = ? FOR UPDATE",
              [catName]
            );
            if (categoryResult && categoryResult.length > 0) {
              return categoryResult[0].id;
            } else {
              const [insertResult]: any = await db.execute(
                "INSERT INTO category (name) VALUES (?)",
                [catName]
              );
              return insertResult.insertId;
            }
          })
        );

        await Promise.all(
          categoryIds.map((categoryId: number) => {
            return db.execute(
              "INSERT INTO product_category (product_id, category_id) VALUES (?, ?)",
              [id, categoryId]
            );
          })
        );
      }

      const [priceResult]: any = await db.execute(
        "SELECT id FROM price WHERE price = ?",
        [price]
      );

      let priceId;
      if (priceResult && priceResult.length > 0) {
        priceId = priceResult[0].id;
      } else {
        const [insertPriceResult]: any = await db.execute(
          "INSERT INTO price (price) VALUES (?)",
          [price]
        );
        priceId = insertPriceResult.insertId;
      }

      changedValues["price_id"] = priceId;

      if (Object.keys(changedValues).length > 0) {
        const setClause = Object.keys(changedValues)
          .map((key) => `${key} = ?`)
          .join(", ");
        const values = Object.values(changedValues);
        values.push(id);

        await db.execute(
          `UPDATE products SET ${setClause} WHERE id = ?`,
          values
        );
      }

      await db.commit();
      return res.status(200).json({ msg: "Product updated successfully" });
    } catch (error) {
      await db.rollback();
      console.error("Error updating product:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Internal Server Error" }] });
    } finally {
      await db.end();
    }
  }
);

route.delete(
  "/delete",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  body("id").isInt().notEmpty(),
  async (req: any, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }

    const { id } = req.body;

    const db = await conn();

    try {
      await db.beginTransaction();

      const [orderItemResult]: any = await db.query(
        "SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?",
        [id]
      );

      if (orderItemResult[0].count > 0) {
        await db.query("DELETE FROM order_items WHERE product_id = ?", [id]);
      }

      const [productResult]: any = await db.query(
        "SELECT category_id, price_id FROM product_category pc JOIN products p ON pc.product_id = p.id WHERE pc.product_id = ?",
        [id]
      );

      if (productResult.length === 0) {
        await db.rollback();
        return res.status(404).json({ errors: [{ msg: "Product not found" }] });
      }

      const { category_id: categoryId, price_id: priceId } = productResult[0];

      await db.query("DELETE FROM product_category WHERE product_id = ?", [id]);

      const [deleteProductResult]: any = await db.query(
        "DELETE FROM products WHERE id = ?",
        [id]
      );

      if (deleteProductResult.affectedRows === 1) {
        const [categoryProductsResult]: any = await db.query(
          "SELECT COUNT(*) AS count FROM product_category WHERE category_id = ?",
          [categoryId]
        );

        if (categoryProductsResult[0].count === 0) {
          await db.query("DELETE FROM category WHERE id = ?", [categoryId]);
        }

        const [usedPriceResult]: any = await db.query(
          "SELECT COUNT(*) AS count FROM products WHERE price_id = ?",
          [priceId]
        );

        if (usedPriceResult[0].count === 0) {
          await db.query("DELETE FROM price WHERE id = ?", [priceId]);
        }

        await db.commit();
        return res.json({ message: "Product deleted successfully" });
      } else {
        await db.rollback();
        return res.status(404).json({ errors: [{ msg: "Product not found" }] });
      }
    } catch (error) {
      console.error("Error deleting product:", error);
      await db.rollback();
      return res
        .status(500)
        .json({ errors: [{ msg: "Internal server error" }] });
    } finally {
      await db.end();
    }
  }
);

route.post(
  "/upload",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  upload.single("thumbnail"),
  body("name").isString(),
  body("category").isString(),
  body("price")
    .toFloat() // Mengubah ke tipe data float
    .isNumeric()
    .isLength({ min: 1, max: 6 })
    .custom((value) => value >= 0),
  body("stock")
    .toInt()
    .isNumeric()
    .isLength({ min: 1, max: 3 })
    .custom((value) => value >= 0),
  body("description").isString(),
  async (req: any, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }
    if (!req.file) {
      return res.status(400).json({ errors: [{ msg: "No file uploaded" }] });
    }

    const thumbnail = req.file;
    const { name, category, description, price, stock } = req.body;

    const db = await conn();

    try {
      await db.beginTransaction();

      const [priceResult]: any = await db.execute(
        "INSERT INTO price (price) VALUES (?)",
        [price]
      );

      const { insertId: priceId } = priceResult;

      const [productResult]: any = await db.execute(
        "INSERT INTO products (name, description, stock, thumbnail, price_id) VALUES (?, ?, ?, ?, ?)",
        [name, description, stock, thumbnail.path, priceId]
      );

      const { insertId: productId } = productResult;

      const [categoryResult]: any = await db.execute(
        "INSERT INTO category (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",
        [category]
      );

      let categoryId = categoryResult.insertId;

      await db.execute(
        "INSERT INTO product_category (product_id, category_id) VALUES (?, ?)",
        [productId, categoryId]
      );

      await db.commit();

      return res
        .status(200)
        .json({ msg: "Product uploaded and saved successfully" });
    } catch (error) {
      await db.rollback();
      console.error("Error saving product:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Error saving product" }] });
    } finally {
      await db.end();
    }
  }
);

export default route;
