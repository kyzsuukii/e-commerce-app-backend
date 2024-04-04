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
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({
        errors: [{ msg: "You do not have administrative privileges" }],
      });
    }
    const { limit: queryLimit } = req.query;
    try {
      const db = await conn();
      let query =
        "SELECT pc.product_id AS id,  p.name, p.description, p.price, p.stock, p.thumbnail, c.name AS category_name FROM product_category pc JOIN products p ON pc.product_id = p.id JOIN category c ON pc.category_id = c.id";

      const limit = queryLimit ? parseInt(`${queryLimit}`) : null;

      if (limit) {
        query += ` LIMIT ${limit}`;
      }

      const [products]: any = await db.execute(query);

      if (!products[0]) {
        return res.status(404).json({ errors: [{ msg: "Product not Found" }] });
      }

      res.json(products);
    } catch (error) {
      res.status(500).json({ errors: [{ msg: "Error fetching products" }] });
    }
  },
);

route.get(
  "/get/:id",
  passport.authenticate("jwt", { session: false }),
  async (req: any, res) => {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({
        errors: [{ msg: "You do not have administrative privileges" }],
      });
    }
    const { id } = req.params;

    try {
      const db = await conn();
      const [product]: any = await db.execute(
        "SELECT p.id, p.name, p.description, p.price, p.stock, p.thumbnail, c.name AS category_name FROM product_category pc JOIN products p ON pc.product_id = p.id JOIN category c ON pc.category_id = c.id WHERE pc.product_id IN (?);",
        [id],
      );

      if (!product[0]) {
        return res.status(404).json({ errors: [{ msg: "Product not Found" }] });
      }

      res.json(product[0]);
    } catch (error) {
      res.status(500).json({ errors: [{ msg: "Error fetching products" }] });
    }
  },
);

route.get(
  "/category/:categoryName",
  passport.authenticate("jwt", { session: false }),
  async (req: any, res) => {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({
        errors: [{ msg: "You do not have administrative privileges" }],
      });
    }

    const { categoryName } = req.params;

    try {
      const db = await conn();
      const [product]: any = await db.execute(
        "SELECT p.id, p.name, p.description, p.price, p.stock, p.thumbnail, c.name AS category_name FROM products p JOIN product_category pc ON p.id = pc.product_id JOIN category c ON pc.category_id = c.id WHERE c.name = ?",
        [categoryName],
      );

      if (!product[0]) {
        return res.status(404).json({ errors: [{ msg: "Product not Found" }] });
      }

      res.json(product);
    } catch (error) {
      res.status(500).json({ errors: [{ msg: "Error fetching products" }] });
    }
  },
);

route.put(
  "/update",
  passport.authenticate("jwt", { session: false }),
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

    const { name, category, description, price, stock } = req.body;
  },
);

route.delete(
  "/delete",
  passport.authenticate("jwt", { session: false }),
  body("id").isInt().notEmpty(),
  async (req: any, res) => {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({
        errors: [{ msg: "You do not have administrative privileges" }],
      });
    }

    const { id } = req.body;

    try {
      const db = await conn();

      const [product]: any = await db.query(
        "SELECT category_id FROM product_category WHERE product_id = ?",
        [id],
      );

      if (product.length === 0) {
        return res.status(404).json({ errors: [{ msg: "Product not found" }] });
      }

      const categoryId = product[0].category_id;

      const [result]: any = await db.query(
        "DELETE FROM products WHERE id = ?",
        [id],
      );

      if (result.affectedRows === 1) {
        const [otherProducts]: any = await db.query(
          "SELECT COUNT(*) AS count FROM product_category WHERE category_id = ? AND product_id != ?",
          [categoryId, id],
        );

        if (otherProducts[0].count === 0) {
          await db.query("DELETE FROM category WHERE id = ?", [categoryId]);
        }

        return res.json({ message: "Product deleted successfully" });
      } else {
        return res.status(404).json({ errors: [{ msg: "Product not found" }] });
      }
    } catch (error) {
      console.error("Error deleting product:", error);
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
    console.log(req.body);
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

    const file = req.file;
    const { name, category, description, price, stock } = req.body;

    try {
      const db = await conn();
      const [insertedProduct]: any = await db.execute(
        "INSERT INTO products (name, description, price, stock, thumbnail) VALUES (?, ?, ?, ?, ?)",
        [name, description, price, stock, file.path],
      );

      const { insertId: productId } = insertedProduct;

      const [insertedCategory]: any = await db.execute(
        "INSERT INTO category (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",
        [category],
      );

      const { insertId: categoryId } = insertedCategory;

      await db.execute(
        "INSERT INTO product_category (product_id, category_id) VALUES (?, ?)",
        [productId, categoryId],
      );

      res.json({ msg: "Product uploaded and saved successfully" });
    } catch (error) {
      console.error("Error saving product:", error);
      res.status(500).json({ errors: [{ msg: "Error saving product" }] });
    }
  },
);

export default route;
