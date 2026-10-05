import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', { id: text('id').primaryKey(), name:text('name').notNull(), email:text('email').notNull().unique(), password:text('password').notNull(), role:text('role').notNull(), createdAt:integer('created_at').notNull() });
export const sessions = sqliteTable('sessions',{id:text('id').primaryKey(),userId:text('user_id').notNull(),expires:integer('expires').notNull()});
export const simulation = sqliteTable('simulation',{id:text('id').primaryKey(),revision:integer('revision').notNull().default(0),data:text('data').notNull()});
export const audit = sqliteTable('audit',{id:text('id').primaryKey(),userId:text('user_id').notNull(),role:text('role').notNull(),action:text('action').notNull(),emergencyId:text('emergency_id'),before:text('before'),after:text('after'),createdAt:integer('created_at').notNull()});
export const rateLimits = sqliteTable('rate_limits',{id:text('id').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});
export const signingKeys = sqliteTable('signing_keys',{id:text('id').primaryKey(),secret:text('secret').notNull()});
export const profiles = sqliteTable('profiles',{userId:text('user_id').primaryKey(),data:text('data').notNull()});
