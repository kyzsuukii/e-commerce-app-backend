import express from "express";
import { body, validationResult } from "express-validator";
import passport from "passport";
import { conn } from "../../lib/db";
import { isAdmin } from "../../lib/utils";

const route = express.Router();

route.post(
  "/create",
  passport.authenticate("jwt", { session: false }),
  body("items").isArray({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const customerId = req.user?.id;

    const { items } = req.body;

    const db = await conn();

    try {
      await db.beginTransaction();

      const [userAddressResult]: any = await db.execute(
        "SELECT address FROM auth WHERE id = ?",
        [customerId]
      );

      if (!userAddressResult.length || !userAddressResult[0].address) {
        return res
          .status(400)
          .json({ errors: [{ msg: "Set address first on your profile" }] });
      }

      let totalAmount = 0;

      for (const item of items) {
        const { id, quantity } = item;

        if (id !== undefined && quantity !== undefined) {
          const [productStock]: any = await db.execute(
            "SELECT stock FROM products WHERE id = ?",
            [id]
          );

          if (productStock && productStock.length > 0) {
            const availableStock = productStock[0].stock;
            if (availableStock === 0) {
              return res.status(400).json({
                errors: [
                  {
                    msg: `Product is out of stock`,
                  },
                ],
              });
            }
            if (quantity > availableStock) {
              return res.status(400).json({
                errors: [
                  {
                    msg: `Ordered quantity exceeds available stock`,
                  },
                ],
              });
            }
          } else {
            return res
              .status(400)
              .json({ errors: [{ msg: "Product stock not found" }] });
          }

          const [productPrice]: any = await db.execute(
            "SELECT price FROM price WHERE id = (SELECT price_id FROM products WHERE id = ?)",
            [id]
          );

          if (productPrice && productPrice.length > 0) {
            totalAmount += productPrice[0].price * quantity;
          } else {
            console.error("Product price not found for product:", id);
            return res
              .status(400)
              .json({ errors: [{ msg: "Product price not found" }] });
          }
        } else {
          console.error("One or more item properties are undefined:", item);
          return res
            .status(400)
            .json({ errors: [{ msg: "Invalid item properties" }] });
        }
      }

      const [orderResult]: any = await db.execute(
        "INSERT INTO orders (customer_id, total_amount) VALUES (?, ?)",
        [customerId, totalAmount]
      );
      const orderId = orderResult.insertId;

      for (const item of items) {
        const { id, quantity } = item;

        if (id !== undefined && quantity !== undefined) {
          await db.execute(
            "INSERT INTO order_items (order_id, product_id, quantity, price_id) VALUES (?, ?, ?, (SELECT price_id FROM products WHERE id = ?))",
            [orderId, id, quantity, id]
          );

          await db.execute(
            "UPDATE products SET stock = stock - ? WHERE id = ?",
            [quantity, id]
          );
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
        "SELECT o.id, a.email, o.total_amount, a.address, o.order_date, o.order_status, oi.id AS order_item_id, oi.quantity, pr.price, p.name AS product_name, p.description AS product_description FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id JOIN auth a ON o.customer_id = a.id JOIN price pr ON oi.price_id = pr.id ORDER BY o.order_date DESC"
      );      

      const groupedOrders = orders.reduce((acc: any[], order: any) => {
        const {
          id,
          email,
          total_amount,
          address,
          order_date,
          order_status,
          ...item
        } = order;
        if (!acc[id]) {
          acc[id] = {
            id,
            email,
            total_amount,
            address,
            order_date,
            order_status,
            items: [],
          };
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
  "/status",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  async (req, res) => {
    const { orderStatus: status, orderId } = req.body;

    const db = await conn();

    try {
      const [order]: any = await db.execute(
        "SELECT order_status FROM orders WHERE id = ? LIMIT 1",
        [orderId]
      );

      if (!order || order.length === 0) {
        return res.status(404).json({ error: "Order not found" });
      }

      const currentStatus = order[0].order_status;

      if (currentStatus === status) {
        return res
          .status(400)
          .json({ error: "Status is already set to the provided value" });
      }

      const [result]: any = await db.execute(
        "UPDATE orders SET order_status = ? WHERE id = ?",
        [status, orderId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Order not found" });
      }

      return res.status(200).json({ msg: "Order status updated successfully" });
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

      return res.status(200).json({ msg: "Order deleted successfully" });
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
      await db.beginTransaction();

      const [item]: any = await db.execute(
        "SELECT order_id, product_id, quantity FROM order_items WHERE id = ?",
        [itemId]
      );

      if (!item || item.length === 0) {
        await db.rollback();
        return res.status(404).json({ error: "Order item not found" });
      }

      const { order_id: orderId, product_id: productId, quantity } = item[0];

      await db.execute("DELETE FROM order_items WHERE id = ?", [itemId]);

      const [productStock]: any = await db.execute(
        "SELECT stock FROM products WHERE id = ?",
        [productId]
      );

      if (productStock && productStock.length > 0) {
        const currentStock = productStock[0].stock;
        const newStock = currentStock + quantity;
        await db.execute("UPDATE products SET stock = ? WHERE id = ?", [
          newStock,
          productId,
        ]);
      } else {
        await db.rollback();
        return res.status(404).json({ error: "Product not found" });
      }

      await db.commit();

      return res.status(200).json({ msg: "Order item deleted successfully" });
    } catch (error) {
      await db.rollback();
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

      const [userAddress]: any = await db.execute(
        "SELECT address FROM auth WHERE id = ?",
        [userId]
      );

      if (!userAddress.length || !userAddress[0].address) {
        return res.status(400).json({ error: "Address not found for user" });
      }

      const [orders]: any = await db.execute(
        "SELECT o.id, o.total_amount, ? AS address, o.order_date, o.order_status, oi.id AS order_item_id, oi.quantity, pr.price, p.name AS product_name, p.description AS product_description FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id JOIN price pr ON p.price_id = pr.id WHERE o.customer_id = ? ORDER BY o.order_date DESC",
        [userAddress[0].address, userId]
      );      

      const groupedOrders = orders.reduce((acc: any[], order: any) => {
        const { id, total_amount, address, order_date, order_status, ...item } =
          order;
        if (!acc[id]) {
          acc[id] = {
            id,
            total_amount,
            address,
            order_date,
            order_status,
            items: [],
          };
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
