const jwt=require('jsonwebtoken');const {auth,generateToken}=require('../auth');
const original={...process.env};
const response=()=>({status:jest.fn().mockReturnThis(),json:jest.fn()});
beforeEach(()=>{process.env.JWT_SECRET='fictitious-session-secret';delete process.env.AUTH_SESSION_VERSION});
afterAll(()=>{process.env=original});
test('configured session version is signed and accepted',async()=>{process.env.AUTH_SESSION_VERSION='after-security-fix';const token=generateToken('user');expect(jwt.verify(token,process.env.JWT_SECRET).sessionVersion).toBe('after-security-fix');const next=jest.fn();await auth({header:()=>`Bearer ${token}`},response(),next);expect(next).toHaveBeenCalledTimes(1)});
test.each([undefined,'previous-version'])('older tokens rejected without granting identity: %s',async version=>{process.env.AUTH_SESSION_VERSION='new-version';const claims={id:'owner'};if(version)claims.sessionVersion=version;const token=jwt.sign(claims,process.env.JWT_SECRET),res=response(),next=jest.fn();await auth({header:()=>`Bearer ${token}`},res,next);expect(res.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled()});
test('unconfigured local fixture remains compatible',async()=>{const token=generateToken('user'),next=jest.fn();await auth({header:()=>`Bearer ${token}`},response(),next);expect(next).toHaveBeenCalled()});
test('only Bearer authentication accepted',async()=>{const token=generateToken('user'),res=response(),next=jest.fn();await auth({header:()=>token},res,next);expect(res.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled()});
