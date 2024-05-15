const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app=express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors({
  origin: [
    'http://localhost:5173'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.niwwhqe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// middlewares
const logger = (req, res, next)=>{
  console.log('log: info ',req.method, req.url);
  next();
}

const verifyToken = (req, res, next)=>{
  const token = req.cookies?.token;
  // console.log('token in the middleware', token);
  // no token available
  if(!token){
    return res.status(401).send({message: 'unauthorized access'})
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded)=>{
    if(err){
      return res.send({message: 'unauthorized access'})
    }
    req.user = decoded;
    next();
  })
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // const userCollection = client.db('juteDB').collection('user');
    const booksCollection = client.db('library').collection('books');
    const categoryCollection = client.db('library').collection('category');
    const borrowCollection = client.db('library').collection('borrowed');


    // auth related api
    app.post('/jwt', async(req, res)=>{
      const user = req.body;
      console.log('user for token', user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn:'1hr'})
      res.cookie('token', token, {
        httpOnly:true,
        secure: true,
        sameSite:'none'
      })
      .send({success: true})
    })

    app.post('/logout', async(req, res)=>{
      const user = req.body;
      console.log('logging out ', user);
      res.clearCookie('token',{maxAge:0 }).send({success:true})
    })

    // category related api
    app.get('/category',async(req, res)=>{
      const category = await categoryCollection.find().toArray();
      res.send(category)
    })

    app.get('/details/:id', async(req, res) =>{
      const id = req.params;
      const query = {_id: new ObjectId(id)};
      const book = await booksCollection.findOne(query);
      res.send(book);
    })
    // same category data
    app.get('/sameCategory/:category', async(req, res)=>{
      const mainCategory= req.params.category;
      // console.log(mainCategory)
      const query ={category_name: mainCategory}
      const result = await booksCollection.find(query).toArray();
      // console.log(result);
      res.send(result)
    })

    // books related api
    app.get('/books',logger, verifyToken, async(req, res)=>{
      // console.log('token owner info :',req.user)
      const books = await booksCollection.find().toArray();
      res.send(books);
    })
    
    app.post('/books',verifyToken, async(req, res) =>{
      const book = req.body;
      // Convert quantity and rating to integers
      book.quantity = parseInt(book.quantity);
      book.rating = parseInt(book.rating);
      const result = await booksCollection.insertOne(book);
      res.send(result);
    })

    // particular user
    app.get('/borrow/books',verifyToken, async(req, res)=>{
      const email = req.query.email;
      console.log('token owner info ',req.user)
      if(req.user.email !== req.query.email){
        return res.status(403).send({message:'forbidden access'})
      }
      const query ={user: email};
      const result = await borrowCollection.find(query).toArray();
      res.send(result);
    })
    app.post('/borrow/books', async(req, res)=>{
      const borrowInfo = req.body;
      const { userId, user } = borrowInfo;
      console.log('userid',userId,'user', user)
      
      // Check if the book already exists for the user
      const existingBorrowedBook = await borrowCollection.findOne({ userId, user });
      if (existingBorrowedBook) {
          return res.status(400).send({ error: 'You have already borrowed this book' });
      }
      const result = await borrowCollection.insertOne(borrowInfo);
      res.send(result)
    })

    // books read for update
    app.get('/updateBook/:id', async(req, res) =>{
      const id = req.params.id;
      // console.log(id)
      const query ={ _id: new ObjectId(id)}
      const result = await booksCollection.findOne(query);
      res.send(result)
    })

    app.patch('/book/:id/decrease', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await booksCollection.updateOne(query, { $inc: {quantity:-1}})
      // console.log(result);
      res.send(result)
    })
    // increase
    app.patch('/book/:id/increase', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await booksCollection.updateOne(query, { $inc: {quantity:1}})
      // console.log(result);
      res.send(result)
    })

    app.delete('/borrowedBooks/:id', async(req, res)=>{
      const id = req.params.id;
      const query ={_id: id};
      const result = await borrowCollection.deleteOne(query)
      res.send(result)
    })

    app.put('/update/:id', async(req, res) =>{
      const id = req.params.id;
      // console.log('id for update ',id)
      const updateBook = req.body;
      updateBook.quantity = parseInt(updateBook.quantity);
      updateBook.rating = parseInt(updateBook.rating);
      const filter= {_id: new ObjectId(id)}
      const option = { upsert: true }
      const book ={
        $set:{
          image: updateBook.image, book_name:updateBook.book_name,
           author_name:updateBook.author_name, category_name:updateBook.category_name,
            rating:updateBook.rating, quantity:updateBook.quantity,
            description:updateBook.description
        }
      }
      const result = await booksCollection.updateOne(filter, book, option)
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/',(req, res)=>{
    res.send('Library is running')
})
app.listen(port, ()=>{
    console.log(`Library management is running on port ${port}`)
})