const {MongoClient} = require('mongodb');
require('dotenv').config({path: './config.env'});

async function main() {
    const client = new MongoClient(process.env.ATLAS_URI);
    try {
        await client.connect();
        const collections = await client.db('CRUW').collections();
        collections.forEach(collection => {
            console.log(collection.s.namespace.collection);
        });
    } catch (error) {
        console.error(error);
    }
    finally {
        await client.close();
    }
}

main().catch(console.error);