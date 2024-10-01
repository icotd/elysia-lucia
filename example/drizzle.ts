import { Elysia, t } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { Lucia } from '../src/index';
import { drizzleAdapter } from '@lucia-auth/adapter-drizzle'; // Import Drizzle adapter
import { drizzle } from 'drizzle-orm'; // Import Drizzle ORM
import { connect } from 'drizzle-orm/sqlite'; // Use the SQLite connector or adjust as necessary

const { GH_CLIENT_ID, GH_CLIENT_SECRET } = process.env;

if (!GH_CLIENT_ID || !GH_CLIENT_SECRET) throw new Error('GitHub OAuth token is needed');

// Set up Drizzle connection (adjust based on your database)
const db = drizzle(connect({
    // Your database connection configuration here
}));

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
    adapter: drizzleAdapter(db) // Use Drizzle adapter
});

const authController = new Elysia({ prefix: '/auth' })
    .use(auth)
    .use(
        oauth.github({
            clientId: GH_CLIENT_ID,
            clientSecret: GH_CLIENT_SECRET
        })
    )
    .guard(
        {
            body: t.Object({
                username: t.String(),
                password: t.String()
            })
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
            isSignIn: true
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
