create table auth (
  id int auto_increment primary key,
  email varchar(64) not null,
  password varchar(255) not null,
  role enum ('CUSTOMER', 'ADMIN') default 'CUSTOMER' not null,
  address varchar(255),
  constraint email unique (email)
);

create table category (
  id bigint auto_increment primary key,
  name varchar(255) not null,
  constraint name unique (name)
);

create table orders (
  id bigint auto_increment primary key,
  customer_id int not null,
  order_date timestamp default CURRENT_TIMESTAMP null,
  total_amount decimal(10, 2) not null,
  order_status enum (
    'PENDING',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'COMPLETED'
  ) default 'PENDING' not null,
  constraint orders_ibfk_1 foreign key (customer_id) references auth (id)
);

create index orders_customer_id_index on orders (customer_id);

create table price (
  id bigint unsigned auto_increment primary key,
  price decimal(10, 2) not null
);

create table products (
  id bigint auto_increment primary key,
  name varchar(255) not null,
  description text not null,
  price_id bigint unsigned not null,
  stock int not null,
  thumbnail varchar(255) not null,
  constraint products_ibfk_1 foreign key (price_id) references price (id)
);

create table order_items (
  id bigint auto_increment primary key,
  order_id bigint not null,
  product_id bigint not null,
  quantity int not null,
  price_id bigint unsigned not null,
  constraint order_items_ibfk_1 foreign key (order_id) references orders (id),
  constraint order_items_ibfk_2 foreign key (product_id) references products (id),
  constraint order_items_ibfk_3 foreign key (price_id) references price (id)
);
sql formatter
create index order_items_order_id_index on order_items (order_id);

create index order_items_product_id_index on order_items (product_id);

create index price_id on order_items (price_id);

create table product_category (
  product_id bigint not null,
  category_id bigint not null,
  primary key (product_id, category_id),
  constraint product_category_ibfk_1 foreign key (product_id) references products (id),
  constraint product_category_ibfk_2 foreign key (category_id) references category (id)
);

create index product_category_category_id_index on product_category (category_id);

create index price_id on products (price_id);