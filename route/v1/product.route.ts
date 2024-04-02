import express from "express";
import passport from "passport";
import multer from "multer";
import * as path from "path";
import {conn} from "../../lib/db";

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

route.get("/all", async (req, res) => {
    const {limit: queryLimit} = req.query
    try {
        const db = await conn();
        let query = "SELECT * FROM products";
        let queryParams = [];
        const limit = queryLimit ? parseInt(`${queryLimit}`) : null;

        if (limit) {
            query += ` LIMIT ${limit}`;
        }

        const [products] = await db.execute(query);

        res.json(products);
    } catch (error) {
        res.status(500).json({errors: [{msg: "Error fetching products"}]});
    }
});

route.post(
    "/upload",
    passport.authenticate("jwt", {session: false}),
    upload.single("productImages"),
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({errors: [{msg: "No file uploaded"}]});
        }

        const file = req.file;

        const {title, category, description, price, stock} = req.body;

        try {
            const db = await conn();
            let [categoryResult]: any = await db.execute(
                "SELECT id FROM category WHERE name = ?",
                [category]
            );

            let categoryId;

            if (categoryResult.length > 0) {
                categoryId = categoryResult[0].id;
            } else {
                const [insertedCategory]: any = await db.execute(
                    "INSERT INTO category (name) VALUES (?) LIMIT 1",
                    [category]
                );
                categoryId = insertedCategory.insertId;
            }

            await db.execute(
                "INSERT INTO products (title, description, price, stock, image_path, category_id) VALUES (?, ?, ?, ?, ?, ?)",
                [title, description, price, stock, file.path, categoryId]
            );

            res.json({msg: "Product uploaded and saved successfully"});
        } catch (error) {
            console.error("Error saving product:", error);
            res.status(500).json({errors: [{msg: "Error saving product"}]});
        }
    }
);

export default route;
