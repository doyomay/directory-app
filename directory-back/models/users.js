const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');
const pug = require('pug');
const bcrypt = require('@libs/crypt');
const string = require('@libs/string');
const jwt = require('@libs/jwt');
const config = require('@root/config');
const Mailer = require('@libs/Mailer');
const TokenVerification = require('@models/TokenVerification');

const Schema = mongoose.Schema;

const UserSchema = Schema({
  firstname: {
    type: String,
    trim: true,
    maxlength: [30, 'El nombre debe contener máximo 30 caracteres'],
    minlength: [3, 'El nombre debe contener mínimo 3 caracteres'],
    required: [true, 'El nombre es obligatorio'],
  },
  lastname: {
    type: String,
    trim: true,
    maxlength: [30, 'El apellido debe contener máximo 30 caracteres'],
    minlength: [3, 'El apellido debe contener mínimo 3 caracteres'],
    required: [true, 'El apellido es obligatorio'],
  },
  email: {
    type: String,
    trim: true,
    unique: true,
    lowercase: true,
    maxlength: [45, 'El email debe contener máximo 45 caracteres'],
    minlength: [4, 'El email debe contener mínimo 4 caracteres'],
    required: [true, 'El email es obligatorio'],
  },
  password: {
    type: String,
    select: false,
    maxlength: [75, 'La contraseña debe tener máximo 75 caracteres'],
    minlength: [6, 'La contraseña debe tener por lo menos 6 caracteres'],
  },
  isAdmin: {
    type: Boolean,
    default: false,
    min: [0, 'El tipo de usuario debe ser un valor válido'],
    max: [1, 'El tipo de usuario debe ser un valor válido'],
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  company: {
    type: Schema.ObjectId,
    ref: 'companies',
  }
},
{
  timestamps: true,
});

/**
 * Schema Validators
 */
UserSchema.path('email').validate(function (email) {
  let emailRegex = /\S+@\S+\.\S+/;

  if (!emailRegex.test(email)) {
    throw new Error(`El email ${email} no es válido`);
  }
});

/**
 * Custom unique validator errors
 */
UserSchema.plugin(uniqueValidator, { message: 'Error, el valor {PATH} debe ser único' });

/**
 * Hash password
 */
UserSchema.pre('save', async function (next) {
  let user = this;

  if (!user.isModified('password')) {
    return next();
  }

  try {
    let hash = await bcrypt.hashPassword(user.password);
    user.password = hash;
    return next();
  } catch (err) {
    next(err);
  }
});

/**
 * Firstname uppercase
 */
UserSchema.pre('save', function (next) {
  let user = this;

  if (!user.isModified('firstname')) {
    return next();
  }

  user.firstname = string.ucfirst(user.firstname);
  return next();
});

/**
 * Lastname uppercase
 */
UserSchema.pre('save', function (next) {
  let user = this;

  if (!user.isModified('lastname')) {
    return next();
  }

  user.lastname = string.ucfirst(user.lastname);
  return next();
});

UserSchema.pre('save', function (next) {
  this.wasNew = this.isNew;
  next();
});

/**
 * Send email verification account
 */
UserSchema.post('save', async function (doc, next) {
  try {
    if (!this.wasNew) {
      return next();
    }

    const { _id, isAdmin, firstname, email } = doc;
    const { host, rootPath } = config.app;

    const token = await bcrypt.hashPassword(`${firstname}${email}${Date.now()}`);

    const tokenVerification = new TokenVerification({ user: _id, token });
    tokenVerification.save();

    const mailer = new Mailer();

    const html = pug.renderFile(`${rootPath}/resources/templates/verifyEmailTemplate.pug`, {
      name: firstname,
      url: `${host}/api/v1/tokenVerifications?token=${token}`,
    });

    if (isAdmin) {
      mailer.sendEmail({
        to: email,
        subject: 'Bienvenido a Directory App - Valida tu cuenta',
        html,
      });

      return next();
    }
  } catch (e) {
    return next(e);
  }
});

/**
 * Methods
 */
UserSchema.methods.comparePassword = function (candidatePassword) {
  return new Promise(async (resolve, reject) => {
    if (!candidatePassword) {
      return reject(new Error('Contraseña inválida'));
    }

    try {
      let compare = await bcrypt.comparePassword(candidatePassword, this.password);
      resolve(compare);
    } catch (error) {
      reject(error);
    }
  });
};

UserSchema.methods.toggleActive = function () {
  return new Promise(async (resolve, reject) => {
    try {
      this.isActive = !this.isActive;
      await this.save();
      resolve(this);
    } catch (error) {
      reject(error);
    }
  });
};

UserSchema.methods.getToken = function () {
  return new Promise(async (resolve, reject) => {
    try {
      const payload = {
        id: this._id,
        email: this.email,
        firstname: this.firstname,
        lastname: this.lastname,
      };

      const options = { expiresIn: '30 days' };

      const token = await jwt.encode(payload, config.app.secret, options);
      return resolve(token);
    } catch (e) {
      reject(e);
    }
  });
};

module.exports = mongoose.model('users', UserSchema);
