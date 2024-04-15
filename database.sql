CREATE TABLE auth
  (
     id       INT auto_increment PRIMARY KEY,
     email    VARCHAR(64) NOT NULL,
     password VARCHAR(255) NOT NULL,
     role     ENUM ('ADMIN', 'CUSTOMER') DEFAULT 'CUSTOMER' NOT NULL,
     CONSTRAINT email UNIQUE (email)
  );

CREATE TABLE category
  (
     id   BIGINT auto_increment PRIMARY KEY,
     name VARCHAR(255) NOT NULL,
     CONSTRAINT category_name_unique UNIQUE (name)
  );

CREATE TABLE orders
  (
     id           BIGINT auto_increment PRIMARY KEY,
     customer_id  INT NOT NULL,
     order_date   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NULL,
     total_amount DECIMAL(10, 2) NOT NULL,
     address      VARCHAR(255) NOT NULL,
     order_status ENUM ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED') DEFAULT
     'PENDING' NOT NULL,
     CONSTRAINT orders_ibfk_1 FOREIGN KEY (customer_id) REFERENCES auth (id)
  );

CREATE INDEX customer_id ON orders (customer_id);

CREATE TABLE products
  (
     id          BIGINT auto_increment PRIMARY KEY,
     name        VARCHAR(255) NOT NULL,
     description TEXT NOT NULL,
     price       INT NOT NULL,
     stock       INT NOT NULL,
     thumbnail   VARCHAR(255) NOT NULL
  );

CREATE TABLE order_items
  (
     id         BIGINT auto_increment PRIMARY KEY,
     order_id   BIGINT NOT NULL,
     product_id BIGINT NOT NULL,
     quantity   INT NOT NULL,
     price      DECIMAL(10, 2) NOT NULL,
     CONSTRAINT order_items_ibfk_1 FOREIGN KEY (order_id) REFERENCES orders (id)
     ,
     CONSTRAINT order_items_ibfk_2 FOREIGN KEY (product_id) REFERENCES products
     (id)
  );

CREATE INDEX order_id ON order_items (order_id);

CREATE INDEX product_id ON order_items (product_id);

CREATE TABLE product_category
  (
     product_id  BIGINT NOT NULL,
     category_id BIGINT NOT NULL,
     PRIMARY KEY (product_id, category_id),
     CONSTRAINT product_category_ibfk_1 FOREIGN KEY (product_id) REFERENCES
     products (id),
     CONSTRAINT product_category_ibfk_2 FOREIGN KEY (category_id) REFERENCES
     category (id)
  );

CREATE INDEX idx_category_id ON product_category (category_id); 