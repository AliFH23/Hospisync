import jwt from 'jsonwebtoken';

const ISSUER = 'hospisync';

// Payload is kept minimal: who (sub), what role, which hospital. No personal data.
export function signToken(user) {
  return jwt.sign(
    { role: user.role, hospital: String(user.hospital) },
    process.env.JWT_SECRET,
    {
      subject: String(user._id),
      expiresIn: process.env.JWT_EXPIRES_IN || '8h', // roughly one clinical shift
      issuer: ISSUER,
      algorithm: 'HS256',
    }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { issuer: ISSUER, algorithms: ['HS256'] });
}