const cors =require('cors')
const express= require('express')
const app=express();
const bodyparser=require('body-parser');
const mongo=require('mongodb');
const MongoClient=mongo.MongoClient;
const { ObjectId } = require('mongodb');
// const cookieParser = require('cookie-parser');
const session= require('express-session');
const { check, validationResult } = require('express-validator');
const MongoDBStore = require('connect-mongodb-session')(session)
const bcrypt= require('bcryptjs')
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const URL= process.env.URL;


let _db;
const mongoConnect=(callback)=>{
  MongoClient.connect(URL).then( client=>{
    // console.log(client)
 _db= client.db('HousesData')
    callback()
}).catch(err=>{
    console.log(err)
})
}
const getDB=()=>{
  return _db;
}

const store = new MongoDBStore({
  uri: URL,
  databaseName: 'HousesData',
  collection: 'sessions',
})

const rootDir=path.dirname(require.main.filename);

app.use(bodyparser.json())
app.use(cors({ origin: 'http://localhost:5173',credentials: true,}))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'HousesData',
  resave: false,
  saveUninitialized: false,
  store:store,
}))

const randomString = (length) => {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

const storage = multer.diskStorage({
  destination:(req,file,cb)=>{
   cb(null,"uploads/")
  },
  filename:(req,file,cb)=>{ 
   cb(null,randomString(10) + '-' + file.originalname )
  }
})

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpg' || file.mimetype === 'image/jpeg') {
    cb(null, true);
  } else {
    cb(null, false);
  }
}

const multerStorage = {
  storage, fileFilter
}
app.use(multer(multerStorage).single('photo'))
app.use(express.static(path.join(rootDir,'public')))
app.use('/uploads',express.static(path.join(rootDir,'uploads')))
// app.use('/findHome/uploads',express.static(path.join(rootDir,'uploads')))
// app.use('/posthome/uploads',express.static(path.join(rootDir,'uploads')))

// signUp Details Adding to DataBase
app.post('/signup',  [  
  
  check('fullName')
  .notEmpty()
  .withMessage('FullName is required')
  .trim()
  .isLength({min:5})
  .withMessage('length should be atleast 5 characters long')
  .matches(/^[A-Za-z\s]+$/)
  .withMessage('FullName can contain only letters'),

    check('username')
  .notEmpty()
  .withMessage('username is required')
  .trim()
  .isLength({min:5})
  .withMessage('length should be atleast 5 characters long')
  .matches(/^(?=.*[A-Za-z])\S*$/)
  .withMessage('username can contain only letters and no space'),

   check('password')
  .trim()
  .isLength({min:8})
  .withMessage('length should be atleast 8 characters long')
  // .matches(/[A-Z]/)
  // .withMessage('password must contain alteast 1 uppercase')
  // .matches(/[a-z]/)
  // .withMessage('password must contain alteast 1 lowercase')
  // .matches(/[0-9]/)
  // .withMessage('password must contain alteast 1 number')
  .matches(/^(?=(?:.*\d){3,}).+$/)
  .withMessage('password must contain alteast 3 numbers'),
  
  check('confirmPassword')
   .trim()
   .custom((value,{req})=>{
    if(value !== req.body.password){
      console.log(value, req.body.password)
      throw new Error('password does not match');
    }
    return true
   }),
   
   check('terms')
    .notEmpty()
    .withMessage('please accept the terms and conditions')
    .custom((value,{req})=>{
      if(value !== 'on'){
        throw new Error('you must accept terms & conditions');
      }
      return true;
    }),

   async  (req, res) => {
  const signUpDetails = req.body;
  const { fullName, username, password, terms } = signUpDetails;
   const errors = validationResult(req)

   if(!errors.isEmpty()){
     const formattedErrors = {};

      errors.array().forEach(err => {
    formattedErrors[err.path] = err.msg;
  });

     res.send({
      isLoggedIn: false,
      errors: formattedErrors,
    })
   }
   else {
    bcrypt.hash(password , 12)
    .then( hashedPassword => {
      const userDetails =  {
        fullName:fullName,
        username:username,
        password: hashedPassword,
        terms:terms,
        postedHomes:[],
        favourites:[],
      }
      const db=getDB();
      if(signUpDetails._id){
            db.collection('userData').updateOne({_id: new ObjectId(String(signUpDetails._id))},{$set:userDetails}).then(() => {
         req.session.destroy(()=>{
          res.json({status:'ok'})     
     })
      })
    }else{
        db.collection('userData').insertOne(userDetails).then(() => {
        res.json({status:'ok'})
      })
    }
    })
   }
}] )

app.post('/login', async (req, res) => {
    const db = getDB();

  const {username, password} = req.body;
    const user = await db.collection('userData').findOne({username});

    if (!user) {
      return res.send({
      isLoggedIn: false,
      errors: ["Invalid username"],
      });
    }

    const isMatched = await bcrypt.compare(password, user.password);
    if (!isMatched) {
      return res.send({
      isLoggedIn: false,
      errors: ["Invalid password"],
      });
    }

     req.session.user = user;
     req.session.isLoggedIn = true
     req.session.save();
    res.json({status:"Ok"})
});

app.post('/logout', async (req, res) => {
  const logout = await req.body;
  if (logout.isLoggedOut === false) {
     req.session.destroy(()=>{
        res.sendStatus(200);       
     })
  }
})

app.use( async (req, res,next) => {
  //  user= req.session.user
   req.isLoggedIn= req.session.isLoggedIn
  // console.log('cookie check', req.session);
  next();
});

app.get('/auth', (req, res) => {
  res.send({ isLoggedIn: req.isLoggedIn , user:req.session.user});    
});
 

// responding the data of allhomes to frontend at this "/"this end point
app.get('/', (req,res)=>{
    // res.send({ isLoggedIn: req.session.isLoggedIn });
    const db=getDB();
    db.collection("AllHousesData").find().toArray().then((data)=>{
      res.send(data)
      // console.log(data);
    }).catch(err=>{
      console.log(err);
    })
})

app.get('/myhomes',async (req,res)=>{
   const db=getDB();
   if(req.session.user){
    const userID= await req.session.user._id;
  const user = await db.collection('userData').findOne({ _id: new ObjectId(userID) }); 
  const myhomeIDs= user.postedHomes
  const objectIds = myhomeIDs.map(id => new ObjectId(id))
     await db.collection('AllHousesData').find({ _id: { $in: objectIds } }).toArray().then((data)=>{
      res.send(data)
      // console.log(data);
    }).catch(err=>{
      console.log(err);
    })
  }
})

// responding data of favs to frontend at this "/fav" endpoint
app.get('/fav', async (req,res)=>{
   const db=getDB();
    if(req.session.user){
    const userID= await req.session.user._id;
  const user = await db.collection('userData').findOne({ _id: new ObjectId(userID) });
  const favouritesIDs= user.favourites
  const objectIds = favouritesIDs.map(id => new ObjectId(id))
     await db.collection('AllHousesData').find({ _id: { $in: objectIds } }).toArray().then((data)=>{
      res.send(data)
      // console.log(data);
    }).catch(err=>{
      console.log(err);
    })
  }
})

// data of opening details page
app.get('/home/:id', async (req, res) => {
    const db=getDB();
  const home = await req.params.id
    const user = await db.collection('AllHousesData').findOne({ _id: new ObjectId(home) });
    res.send(user)
});

// const upload = multer({ storage: multer.memoryStorage() });

// incomming data from the inputs of "/"endpoint . and saving in allhomes DataBase.
app.post('/', async (req,res)=>{
    const db=getDB();
    const { location, area, rent, BHK, sqft, more_details } = await req.body;
    const  photo = await req.file.path;
    const Homes= { location , area, rent, BHK, sqft, more_details, photo};
     const userID = req.session.user._id;
     const username= req.session.user

const date = new Date();

const day = String(date.getDate()).padStart(2, '0'); 
const month = String(date.getMonth() + 1).padStart(2, '0'); 
const year = date.getFullYear();

     console.log( Homes , photo)
// new
    const updatingData={
      //  username:Homes.username,
    photo:Homes.photo,      
    location: Homes.location,
    area: Homes.area,
    rent: Homes.rent,
    BHK: Homes.BHK,
    sqft: Homes.sqft,
    more_details: Homes.more_details,

    }
   if(Homes._id){
     db.collection('AllHousesData').updateOne({_id: new ObjectId(String(Homes._id))},{$set:updatingData}).then(() => {
        res.json({status:'ok'})
      })
   }else {
    // old  
 const houseData=  await db.collection('AllHousesData').insertOne({
      ...Homes,
      postedBy: username.username,
      createdAt:`${day}/${month}/${year}`
    });    
     const newHouseId = houseData.insertedId;

     await db.collection('userData').updateOne(
      { _id: new ObjectId(userID) },
      { $push: { postedHomes: newHouseId } }
    ).then(() => {
        res.json({status:'ok'})
      })
 }
 })

// incomming data from the inputs of "/fav"endpoint . and saving in fav DataBase.
 app.post('/fav', async (req,res)=>{
    const db=getDB();
     if(req.session.user){
    const userID = await req.session.user._id;
    const favHouseID= await req.body
    const user = await db.collection('userData').findOne({ _id: new ObjectId(userID) });
    const favourites = user.favourites 
    
     if (!favourites.includes(favHouseID)) {
      // favourites.push(favHouseID);
      await db.collection('userData').updateOne(
        { _id: new ObjectId(userID) },
        { $push: { favourites: new ObjectId(favHouseID) } }
      ).then(() => {
        res.json({status:'ok'})
      })
    }
  }
 })    

//  deleting Data from favorites list from this "/fav/del" endpoints 
app.delete('/fav/del', async (req,res)=>{
    const db=getDB();
    const userID = await req.session.user._id;
    const deletefav= await req.body
    console.log(userID, deletefav)
    await db.collection('userData').updateOne({ _id: new ObjectId(userID) }, { $pull: { favourites:  new ObjectId(deletefav.id) } });
}) 

// deleting Data from allHomes list from "/" endpoint
 app.delete('/', async (req,res)=>{
    const db=getDB();
    const userID = await req.session.user._id;
    const deleteHome= await req.body
     await db.collection('userData').updateOne({ _id:new ObjectId(userID) }, { $pull: { postedHomes: new ObjectId(deleteHome.id)  } });
    await db.collection('AllHousesData').deleteOne({_id: new ObjectId(String(deleteHome.id))})  
 })
 
// deleting userData from allHomes list from "/" endpoint
 app.delete('/account', async (req,res)=>{
    const db=getDB();
    const userID = await req.session.user._id;
    console.log(userID)
 const user = await db.collection('userData').findOne({_id: new ObjectId(userID)})

    await db.collection('AllHouses').deleteMany({ postedBy: user.username });
    
    await db.collection('userData').deleteOne({_id: new ObjectId(userID)}).then(() => {
         req.session.destroy(()=>{
          res.json({status:'ok'})     
     })
      })  
 })

const PORT=3000;
mongoConnect( ()=>{
    console.log("connected mongoDB")
  app.listen(PORT,()=>{
    console.log("app listening to http://localhost:3000")
})
})


