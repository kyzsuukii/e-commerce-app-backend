CREATE TABLE auth
(
    id       INT auto_increment PRIMARY KEY,
    email    VARCHAR(64)                                   NOT NULL,
    password VARCHAR(255)                                  NOT NULL,
    role     ENUM ('ADMIN', 'CUSTOMER') DEFAULT 'CUSTOMER' NOT NULL,
    CONSTRAINT email UNIQUE (email)
);

CREATE TABLE category
(
    id   BIGINT auto_increment PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    CONSTRAINT category_name_unique UNIQUE (name)
);

CREATE TABLE products
(
    id          BIGINT auto_increment PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT         NOT NULL,
    price       INT          NOT NULL,
    stock       INT          NOT NULL,
    thumbnail   VARCHAR(255) NOT NULL
);

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