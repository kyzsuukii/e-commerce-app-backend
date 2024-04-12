import express from "express";
import { body, validationResult } from "express-validator";
import passport from "passport";
import { conn } from "../../lib/db";
import { isAdmin } from "../../lib/utils";

const route = express.Router();

route.post(
  "/create",
  passport.authenticate("jwt", { session: false }),
  body("totalAmount").isFloat({ min: 0 }).notEmpty(),
  body("address").isString().notEmpty(),
  body("items").isArray({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const customerId = req.user?.id;

    const { totalAmount, address, items } = req.body;

    const db = await conn();

    try {
      await db.beginTransaction();

      const [orderResult]: any = await db.execute(
        "INSERT INTO orders (customer_id, total_amount, address) VALUES (?, ?, ?)",
        [customerId, totalAmount, address]
      );
      const orderId = orderResult.insertId;

      for (const item of items) {
        const { id, quantity, price } = item;

        if (id !== undefined && quantity !== undefined && price !== undefined) {
          await db.execute(
            "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
            [orderId, id, quantity, price]
          );

          await db.execute(
            "UPDATE products SET stock = stock - ? WHERE id = ?",
            [quantity, id]
          );
        } else {
          console.error("One or more item properties are undefined:", item);
        }
      }

      await db.commit();
      return res
        .status(200)
        .json({ msg: "Order created successfully", orderId });
    } catch (error) {
      await db.rollback();
      console.error("Error creating order:", error);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      await db.end();
    }
  }
);

route.get(
  "/all",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  async (req, res) => {
    const db = await conn();
    try {
      const [orders]: any = await db.execute(
        "SELECT o.id, o.total_amount, o.address, o.order_date, o.order_status, oi.id AS order_item_id, oi.quantity, oi.price, p.name AS product_name, p.description AS product_description FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id ORDER BY o.order_date DESC"
      );

      const groupedOrders = orders.reduce((acc: any[], order: any) => {
        const { id, total_amount, address, order_date, ...item } = order;
        if (!acc[id]) {
          acc[id] = { id, total_amount, address, order_date, items: [] };
        }
        acc[id].items.push(item);
        return acc;
      }, {});

      return res.status(200).json(Object.values(groupedOrders));
    } catch (error) {
      console.error("Error getting orders:", error);
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      await db.end();
    }
  }
);

route.put(
  "/status/:orderId",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    const db = await conn();

    try {
      const [result]: any = await db.execute(
        "UPDATE orders SET order_status = ? WHERE id = ?",
        [status, orderId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Order not found" });
      }

      return res
        .status(200)
        .json({ message: "Order status updated successfully" });
    } catch (error) {
      console.error("Error updating order status:", error);
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      await db.end();
    }
  }
);

route.delete(
  "/delete",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  async (req, res) => {
    const { orderId } = req.body;
    const db = await conn();

    try {
      await db.beginTransaction();

      await db.execute("DELETE FROM order_items WHERE order_id = ?", [orderId]);
      await db.execute("DELETE FROM orders WHERE id = ?", [orderId]);

      await db.commit();

      return res.status(200).json({ message: "Order deleted successfully" });
    } catch (error) {
      await db.rollback();
      console.error("Error deleting order:", error);
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      await db.end();
    }
  }
);

route.delete(
  "/item/delete",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  async (req, res) => {
    const { orderItemId: itemId } = req.body;

    const db = await conn();

    try {
      const [item]: any = await db.execute(
        "SELECT price, quantity FROM order_items WHERE id = ?",
        [itemId]
      );

      if (!item) {
        return res.status(404).json({ error: "Order item not found" });
      }

      const { price, quantity } = item;

      await db.execute("DELETE FROM order_items WHERE id = ?", [itemId]);

      await db.execute(
        "UPDATE orders SET total_amount = total_amount - ? WHERE id = (SELECT order_id FROM order_items WHERE id = ?)",
        [price * quantity, itemId]
      );

      return res
        .status(200)
        .json({ message: "Order item deleted successfully" });
    } catch (error) {
      console.error("Error deleting order item:", error);
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      await db.end();
    }
  }
);

route.get(
  "/get",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    const userId = req.user?.id;

    const db = await conn();

    try {
      const [existingOrders]: any = await db.execute(
        "SELECT id FROM orders WHERE customer_id = ? LIMIT 1",
        [userId]
      );

      if (!existingOrders.length) {
        return res.status(200).json([]);
      }

      const [orders]: any = await db.execute(
        "SELECT o.id, o.total_amount, o.address, o.order_date, o.order_status, oi.id AS order_item_id, oi.quantity, oi.price, p.name AS product_name, p.description AS product_description FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id WHERE o.customer_id = ? ORDER BY o.order_date DESC",
        [userId]
      );

      const groupedOrders = orders.reduce((acc: any[], order: any) => {
        const { id, total_amount, address, order_date, ...item } = order;
        if (!acc[id]) {
          acc[id] = { id, total_amount, address, order_date, items: [] };
        }
        acc[id].items.push(item);
        return acc;
      }, {});

      return res.status(200).json(Object.values(groupedOrders));
    } catch (error) {
      console.error("Error getting orders:", error);
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      await db.end();
    }
  }
);


export default route;
