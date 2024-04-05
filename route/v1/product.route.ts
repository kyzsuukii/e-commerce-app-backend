import express from "express";
import passport from "passport";
import multer from "multer";
import * as path from "path";
import { conn } from "../../lib/db";
import { body, validationResult } from "express-validator";

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
    try {
      if (req.user?.role !== "ADMIN") {
        return res.status(403).json({
          errors: [{ msg: "You do not have administrative privileges" }],
        });
      }

      const { limit: queryLimit } = req.query;
      const db = await conn();

      let query =
        "SELECT p.id, p.name, p.description, p.price, p.stock, p.thumbnail, GROUP_CONCAT(c.name SEPARATOR ', ') AS category_names FROM products p LEFT JOIN product_category pc ON p.id = pc.product_id LEFT JOIN category c ON pc.category_id = c.id GROUP BY p.id";

      const params = [];

      const limit = parseInt(queryLimit, 10);
      if (!isNaN(limit) && limit > 0) {
        query += " LIMIT ?";
        params.push(limit);
      }

      const [products]: any = await db.execute(query, params);

      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ errors: [{ msg: "Error fetching products" }] });
    }
  },
);

route.get(
  "/get/:id",
  passport.authenticate("jwt", { session: false }),
  async (req: any, res) => {
    try {
      if (req.user?.role !== "ADMIN") {
        return res.status(403).json({
          errors: [{ msg: "You do not have administrative privileges" }],
        });
      }

      const { id } = req.params;
      const db = await conn();

      const [product]: any = await db.execute(
        "SELECT p.id, p.name, p.description, p.price, p.stock, p.thumbnail, (SELECT GROUP_CONCAT(c.name SEPARATOR ', ') FROM product_category pc JOIN category c ON pc.category_id = c.id WHERE pc.product_id = p.id) AS category_names FROM products p WHERE p.id = ?",
        [id],
      );

      if (!product[0]) {
        return res.status(404).json({ errors: [{ msg: "Product not found" }] });
      }

      res.json(product[0]);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ errors: [{ msg: "Error fetching product" }] });
    }
  },
);
route.get(
  "/category/:categoryName",
  passport.authenticate("jwt", { session: false }),
  async (req: any, res) => {
    try {
      if (req.user?.role !== "ADMIN") {
        return res.status(403).json({
          errors: [{ msg: "You do not have administrative privileges" }],
        });
      }

      const { categoryName } = req.params;
      const db = await conn();

      const [products]: any = await db.execute(
        "SELECT p.id, p.name, p.description, p.price, p.stock, p.thumbnail, c.name AS category_name FROM products p JOIN product_category pc ON p.id = pc.product_id JOIN category c ON pc.category_id = c.id WHERE c.name = ?;",
        [categoryName],
      );

      if (!products || products.length === 0) {
        return res
          .status(404)
          .json({ errors: [{ msg: "No products found for the category" }] });
      }

      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ errors: [{ msg: "Error fetching products" }] });
    }
  },
);

route.delete(
  "/delete",
  passport.authenticate("jwt", { session: false }),
  body("id").isInt().notEmpty(),
  async (req: any, res) => {
    const { id } = req.body;
    const db = await conn();

    try {
      await db.beginTransaction();

      const [productResult]: any = await db.query(
        "SELECT category_id FROM product_category WHERE product_id = ?",
        [id],
      );

      if (productResult.length === 0) {
        await db.rollback();
        return res.status(404).json({ errors: [{ msg: "Product not found" }] });
      }

      const categoryId = productResult[0].category_id;

      await db.query("DELETE FROM product_category WHERE product_id = ?", [id]);

      const [deleteProductResult]: any = await db.query(
        "DELETE FROM products WHERE id = ?",
        [id],
      );

      if (deleteProductResult.affectedRows === 1) {
        const [categoryProductsResult]: any = await db.query(
          "SELECT COUNT(*) AS count FROM product_category WHERE category_id = ?",
          [categoryId],
        );

        if (categoryProductsResult[0].count === 0) {
          await db.query("DELETE FROM category WHERE id = ?", [categoryId]);
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
    }
  },
);

route.post(
  "/upload",
  passport.authenticate("jwt", { session: false }),
  upload.single("thumbnail"),
  body("name").isString(),
  body("category").isString(),
  body("price")
    .toInt()
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
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({
        errors: [{ msg: "You do not have administrative privileges" }],
      });
    }
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

      const [productResult]: any = await db.execute(
        "INSERT INTO products (name, description, price, stock, thumbnail) VALUES (?, ?, ?, ?, ?)",
        [name, description, price, stock, thumbnail.path],
      );

      const { insertId: productId } = productResult;

      let [categoryResult]: any = await db.execute(
        "INSERT INTO category (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",
        [category],
      );

      let categoryId = categoryResult.insertId;

      await db.execute(
        "INSERT INTO product_category (product_id, category_id) VALUES (?, ?)",
        [productId, categoryId],
      );

      await db.commit();

      return res
        .status(200)
        .json({ msg: "Product uploaded and saved successfully" });
    } catch (error) {
      await db.rollback();
      return res
        .status(500)
        .json({ errors: [{ msg: "Error saving product" }] });
    }
  },
);

export default route;
