import { Elysia, t } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { Lucia } from '../src/index';
import { drizzleAdapter } from '@lucia-auth/adapter-drizzle'; // Import Drizzle adapter
import { drizzle } from 'drizzle-orm/better-sqlite3'; // Use better-sqlite3 for Drizzle ORM
import sqlite from 'better-sqlite3'; // SQLite3 library
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Initialize SQLite database in memory
const sqliteDB = sqlite(':memory:');
const db = drizzle(sqliteDB);

// Define user and session tables using Drizzle ORM
const userTable = sqliteTable('user', {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    password: text('password').notNull(), // Add fields as needed
});

const sessionTable = sqliteTable('session', {
    id: text('id').primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => userTable.id),
    expiresAt: integer('expires_at').notNull(),
});

const { GH_CLIENT_ID, GH_CLIENT_SECRET } = process.env;

if (!GH_CLIENT_ID || !GH_CLIENT_SECRET) throw new Error('GitHub OAuth token is needed');

// Initialize Lucia with the Drizzle adapter
const {
    elysia: auth,
    lucia,
    oauth
} = Lucia<
    {
        username: string;
        age: number;
    },
    'user'
>({
    name: 'user',
    adapter: drizzleAdapter(db, sessionTable, userTable), // Use Drizzle adapter
});

// Set up authentication controller
const authController = new Elysia({ prefix: '/auth' })
    .use(auth)
    .use(
        oauth.github({
            clientId: GH_CLIENT_ID,
            clientSecret: GH_CLIENT_SECRET,
        })
    )
    .guard(
        {
            body: t.Object({
                username: t.String(),
                password: t.String(),
            }),
        },
        (app) =>
            app
                .put('/sign-up', async ({ body, user }) => user.signUp(body))
                .post('/sign-in', async ({ user, body }) => {
                    await user.signIn(body);
                    return `Signed in as ${body.username}`;
                })
    )
    .guard(
        {
            isSignIn: true,
        },
        (app) =>
            app
                .get('/profile', ({ user }) => user.profile)
                .get('/refresh', async ({ user }) => {
                    await user.refresh();
                    return user.profile;
                })
                .get('/sign-out', async ({ user }) => {
                    await user.signOut();
                    return 'Signed out';
                })
    );

// Set up the main Elysia application
const app = new Elysia()
    .use(authController)
    // Uncomment and modify the onBeforeHandle if needed
    // .onBeforeHandle(async ({ path, user }) => {
    //     switch (path) {
    //         case '/swagger':
    //         case '/swagger/json':
    //             await user.validate();
    //     }
    // })
    .use(swagger())
    .use(auth)
    .listen(3000, ({ hostname, port }) => {
        console.log(`Running at http://${hostname}:${port}`);
    });
