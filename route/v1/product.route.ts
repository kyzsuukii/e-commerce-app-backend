import express from "express";
import passport from "passport";
import multer from "multer";
import * as path from "path";
import { body, param, query, validationResult } from "express-validator";
import { findChangedValues, isAdmin } from "../../lib/utils.ts";
import { prisma } from "../../lib/db.ts";

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
    const { limit: q } = req.query;

    try {
      const p = await prisma.productCategory.findMany({
        take: q ? parseInt(q) : undefined,
        include: {
          product: {
            include: {
              price: {
                select: {
                  price: true
                }
              },
            }
          },
          category: {
            select: {
              category: true
            }
          },
        },
      })

      const r = p.map(({ product, category }) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price.price,
        stock: product.stock,
        thumbnail: product.thumbnail,
        category: category.category
      }));

      return res.status(200).json(r);
    } catch (error) {
      console.error("Error fetching products:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Error fetching products" }] });
    } finally {
      await prisma.$disconnect();
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

    const { q } = req.query;


    try {
      const products = await prisma.$queryRaw`SELECT p.*, pr.price, c.category FROM products AS p JOIN price AS pr ON p.priceId = pr.id JOIN product_category AS pc ON p.id = pc.productId JOIN category AS c ON pc.categoryId = c.id WHERE p.name LIKE  CONCAT('%', ${q}, '%')`

      if (!products) {
        return res.status(404).json({ errors: [{ msg: "Product not found" }] });
      }

      return res.status(200).json(products);
    } catch (error) {
      console.error("Error fetching product:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Error fetching product" }] });
    } finally {
      await prisma.$disconnect();
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

    try {
      const p = await prisma.productCategory.findFirst({
        where: {
          productId: parseInt(id),
        },
        include: {
          product: {
            include: {
              price: {
                select: {
                  price: true
                }
              },
            }
          },
          category: {
            select: {
              category: true
            }
          },
        },
      })

      if (!p) {
        return res.status(404).json({ errors: [{ msg: "Product not found" }] });
      }

      const { product, category } = p;
      const r = {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price.price,
        stock: product.stock,
        thumbnail: product.thumbnail,
        category: category.category,
      };

      return res.status(200).json(r);
    } catch (error) {
      console.error("Error fetching product:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Error fetching product" }] });
    } finally {
      await prisma.$disconnect();
    }
  }
);
route.get(
  "/category/:category",
  passport.authenticate("jwt", { session: false }),
  param("category").isString().notEmpty(),
  async (req: any, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }
    
    const { category } = req.params;

    try {
      const p = await prisma.productCategory.findMany({
        where: {
          category
        },
        include: {
          product: {
            include: {
              price: {
                select: {
                  price: true
                }
              },
            }
          },
          category: {
            select: {
              category: true
            }
          },
        },
      })

      const r = p.map(({ product, category }) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price.price,
        stock: product.stock,
        thumbnail: product.thumbnail,
        category: category.category
      }));

      return res.status(200).json(r);
    } catch (error) {
      console.error("Error fetching products:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Error fetching products" }] });
    } finally {
      await prisma.$disconnect();
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
  body("price").toInt().isNumeric().isLength({ min: 1, max: 6 }).custom((value) => value >= 0),
  body("stock").toInt().isNumeric().isLength({ min: 1, max: 3 }).custom((value) => value >= 0),
  body("description").isString(),
  async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }

    try {
      await prisma.$transaction(async (prisma) => {
        const { id, category, price, ...updatedFields } = req.body;

        const product = await prisma.products.findFirst({
          where: { id: parseInt(id) },
          include: {
            category: {
              select: {
                category: {
                  select: {
                    category: true,
                  },
                },
              },
            },
            price: {
              select: {
                price: true,
              },
            },
          },
        });

        if (!product) {
          return res.status(404).json({ errors: [{ msg: "Product not found" }] });
        }

        const changedValues = findChangedValues(product, updatedFields);

        if (category) {
          await prisma.productCategory.deleteMany({ where: { productId: parseInt(id) } });

          const existingCategory = await prisma.category.findFirst({ where: { category } });
          const categoryId = existingCategory
            ? existingCategory.id
            : (await prisma.category.create({ data: { category } })).id;

          await prisma.productCategory.create({
            data: { productId: parseInt(id), categoryId },
          });
        }

        let priceId;
        const priceRecord = await prisma.price.findFirst({ where: { price: parseFloat(price) } });
        if (priceRecord) {
          priceId = priceRecord.id;
        } else {
          const newPrice = await prisma.price.create({ data: { price: parseFloat(price) } });
          priceId = newPrice.id;
        }

        changedValues.priceId = priceId;

        if (Object.keys(changedValues).length > 0) {
          await prisma.products.update({
            where: { id: parseInt(id) },
            data: changedValues,
          });
        }
      });

      return res.status(200).json({ msg: "Product updated successfully" });
    } catch (error) {
      console.error("Error updating product:", error);
      return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
    }
  }
);

route.delete(
  "/delete",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  body("id").isInt().notEmpty(),
  async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }

    const { id } = req.body;

    try {
      await prisma.$transaction(async (prisma) => {
        const orderItemCount = await prisma.orderItems.count({
          where: { productId: parseInt(id) },
        });

        if (orderItemCount > 0) {
          await prisma.orderItems.deleteMany({ where: { productId: parseInt(id) } });
        }

        const product = await prisma.productCategory.findFirst({
          where: { productId: parseInt(id) },
          include: {
            product: {
              select: {
                priceId: true
              }
            }
          }
        });

        if (!product) {
          return res.status(404).json({ errors: [{ msg: "Product not found" }] });
        }

        await prisma.productCategory.deleteMany({ where: { productId: parseInt(id) } });

        await prisma.products.delete({
          where: { id: parseInt(id) },
        });

        const categoryProductsCount = await prisma.productCategory.count({
          where: { categoryId: product.categoryId },
        });

        if (categoryProductsCount === 0) {
          await prisma.category.delete({ where: { id: product.categoryId } });
        }

        const usedPriceCount = await prisma.products.count({
          where: { priceId: product.product.priceId },
        });

        if (usedPriceCount === 0) {
          await prisma.price.delete({ where: { id: product.product.priceId } });
        }
      });

      return res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      return res.status(500).json({ errors: [{ msg: "Internal server error" }] });
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
  body("price").isNumeric().isLength({ min: 1, max: 6 }).custom((value) => value >= 0),
  body("stock").toInt().isNumeric().isLength({ min: 1, max: 3 }).custom((value) => value >= 0),
  body("description").isString(),
  async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }
    if (!req.file) {
      return res.status(400).json({ errors: [{ msg: "No file uploaded" }] });
    }

    const thumbnail = req.file;
    const { name, category, description, price, stock } = req.body;

    try {
      await prisma.$transaction(async (prisma) => {
        const newPrice = await prisma.price.create({
          data: { price: parseFloat(price) },
        });

        const newProduct = await prisma.products.create({
          data: {
            name,
            description,
            stock: parseInt(stock),
            thumbnail: thumbnail.path,
            priceId: newPrice.id,
          },
        });

        let categoryId;
        const existingCategory = await prisma.category.findFirst({
          where: { category },
        });
        if (existingCategory) {
          categoryId = existingCategory.id;
        } else {
          const newCategory = await prisma.category.create({
            data: { category },
          });
          categoryId = newCategory.id;
        }

        await prisma.productCategory.create({
          data: {
            productId: newProduct.id,
            categoryId,
          },
        });
      });

      return res.status(200).json({ msg: "Product uploaded and saved successfully" });
    } catch (error) {
      console.error("Error saving product:", error);
      return res.status(500).json({ errors: [{ msg: "Error saving product" }] });
    }
  }
);


export default route;
