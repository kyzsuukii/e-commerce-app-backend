import express from "express";
import { body, validationResult } from "express-validator";
import passport from "passport";
import { isAdmin } from "../../lib/utils";
import { prisma } from "../../lib/db";

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

    try {
      await prisma.$transaction(async (prisma) => {
        const user = await prisma.users.findFirst({
          where: { id: customerId },
          select: { address: true, id: true },
        });

        if (!user || !user.address) {
          return res.status(400).json({ errors: [{ msg: "Set address first on your profile" }] });
        }

        let totalAmount = 0;

        for (const item of items) {
          const { id, quantity } = item;

          if (id !== undefined && quantity !== undefined) {
            const product = await prisma.products.findFirst({
              where: { id },
              select: { stock: true, priceId: true },
            });

            if (!product) {
              return res.status(400).json({ errors: [{ msg: "Product stock not found" }] });
            }

            if (product.stock === 0) {
              return res.status(400).json({ errors: [{ msg: "Product is out of stock" }] });
            }

            if (quantity > product.stock) {
              return res.status(400).json({ errors: [{ msg: "Ordered quantity exceeds available stock" }] });
            }

            const productPrice = await prisma.price.findFirst({
              where: { id: product.priceId },
              select: { price: true },
            });

            if (!productPrice) {
              console.error("Product price not found for product:", id);
              return res.status(400).json({ errors: [{ msg: "Product price not found" }] });
            }

            totalAmount += productPrice.price * quantity;
          } else {
            console.error("One or more item properties are undefined:", item);
            return res.status(400).json({ errors: [{ msg: "Invalid item properties" }] });
          }
        }

        const newOrder = await prisma.orders.create({
          data: { customerId: user.id, totalAmount },
        });
        const orderId = newOrder.id;

        for (const item of items) {
          const { id, quantity } = item;

          if (id !== undefined && quantity !== undefined) {
            await prisma.orderItems.create({
              data: {
                orderId,
                productId: id,
                quantity,
                priceId: id,
              },
            });

            await prisma.products.update({
              where: { id },
              data: { stock: { decrement: quantity } },
            });
          }
        }
      });

      return res.status(200).json({ msg: "Order created successfully" });
    } catch (error) {
      console.error("Error creating order:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);


route.get(
  "/all",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  async (req, res) => {
    try {
      const orders = await prisma.orders.findMany({
        orderBy: { orderDate: 'desc' },
        include: {
          customer: { select: { email: true, address: true } },
          orderItems: {
            include: {
              product: {
                include: { price: { select: { price: true } } }
              }
            }
          }
        }
      });

      const r = orders.map(order => ({
        id: order.id,
        email: order.customer.email,
        total_amount: order.totalAmount,
        address: order.customer.address,
        order_date: order.orderDate,
        order_status: order.status,
        items: order.orderItems.map(({ id, quantity, product: { price, name, description } }) => ({
          order_item_id: id,
          quantity,
          price: price.price,
          product_name: name,
          product_description: description
        }))
      }));

      return res.status(200).json(r);
    } catch (error) {
      console.error("Error getting orders:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);


route.put(
  "/status",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  async (req, res) => {
    const { orderStatus: status, orderId } = req.body;

    try {
      const order = await prisma.orders.findFirst({
        where: { id: orderId },
        select: { status: true }
      });

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const currentStatus = order.status;

      if (currentStatus === status) {
        return res.status(400).json({ error: "Status is already set to the provided value" });
      }

      const result = await prisma.orders.update({
        where: { id: orderId },
        data: { status }
      });

      if (!result) {
        return res.status(404).json({ error: "Order not found" });
      }

      return res.status(200).json({ msg: "Order status updated successfully" });
    } catch (error) {
      console.error("Error updating order status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

route.delete(
  "/delete",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  async (req, res) => {
    const { orderId } = req.body;

    try {
      await prisma.$transaction(async (prisma) => {
        await prisma.orderItems.deleteMany({ where: { orderId } });
        await prisma.orders.delete({ where: { id: orderId } });
      });

      return res.status(200).json({ msg: "Order deleted successfully" });
    } catch (error) {
      console.error("Error deleting order:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);


route.delete(
  "/item/delete",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  async (req, res) => {
    const { orderItemId: itemId } = req.body;

    try {
      const item = await prisma.orderItems.findFirst({
        where: { id: itemId },
        select: { orderId: true, productId: true, quantity: true }
      });

      if (!item) {
        return res.status(404).json({ error: "Order item not found" });
      }

      const { orderId, productId, quantity } = item;

      await prisma.$transaction(async (prisma) => {
        await prisma.orderItems.delete({ where: { id: itemId } });

        const remainingItems = await prisma.orderItems.findMany({
          where: { orderId: orderId }
        });
        
        if (remainingItems.length === 0) {
          await prisma.orders.delete({ where: { id: orderId } });
        }

        const product = await prisma.products.findUnique({
          where: { id: productId },
          select: { stock: true }
        });

        if (!product) {
          throw new Error("Product not found");
        }

        const currentStock = product.stock;
        const newStock = currentStock + quantity;

        await prisma.products.update({
          where: { id: productId },
          data: { stock: newStock }
        });
      });

      return res.status(200).json({ msg: "Order item deleted successfully" });
    } catch (error) {
      console.error("Error deleting order item:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);


route.get(
  "/get",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    const userId = req.user?.id;

    try {
      const existingOrders = await prisma.orders.findFirst({
        where: { customerId: userId },
        select: { id: true }
      });

      if (!existingOrders) {
        return res.status(200).json([]);
      }

      const userAddress = await prisma.users.findFirst({
        where: { id: userId },
        select: { address: true }
      });

      if (!userAddress || !userAddress.address) {
        return res.status(400).json({ error: "Address not found for user" });
      }

      const orders = await prisma.orders.findMany({
        where: { customerId: userId },
        orderBy: { orderDate: 'desc' },
        include: {
          orderItems: {
            select: {
              id: true,
              quantity: true,
              price: { select: { price: true } },
              product: {
                select: {
                  name: true,
                  description: true
                }
              }
            }
          }
        }
      });

      const formattedOrders = orders.map(order => ({
        id: order.id,
        total_amount: order.totalAmount,
        address: userAddress.address,
        order_date: order.orderDate,
        order_status: order.status,
        items: order.orderItems.map(item => ({
          order_item_id: item.id,
          quantity: item.quantity,
          price: item.price.price,
          product_name: item.product.name,
          product_description: item.product.description
        }))
      }));

      return res.status(200).json(formattedOrders);
    } catch (error) {
      console.error("Error getting orders:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default route;
