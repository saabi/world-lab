#define PI 3.141592653589793
const int SAMPLES = 4;

attribute vec3 position;
attribute float aIdx;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;
uniform vec3 ares;
uniform mat4 inverseModelMatrix;

uniform float angle;
uniform float radius;
uniform float multisampling;
uniform float smoothShading;

uniform float voronoi_scale;
uniform float voronoi_amplitude;
uniform float detail_scale;
uniform float detail_amplitude;
uniform float voronoi_distortion_scale;
uniform float voronoi_distortion_amplitude;

uniform float water_level;
uniform float render_water;

uniform float erosion;

varying float distortion;
varying vec3 vor;
varying float detail;
varying float height;
varying vec3 op;
varying float erosion_value;
varying vec3 norm;
varying vec4 viewPosition;
varying vec3 samplePos;

vec3 hash( vec3 x ) {
  x = vec3( dot(x,vec3(127.1,311.7, 74.7)),
            dot(x,vec3(269.5,183.3,246.1)),
            dot(x,vec3(113.5,271.9,124.6)));

  return fract(sin(x)*43758.5453123);
}

vec3 voronoi( in vec3 x ) {
    vec3 p = floor( x );
    vec3 f = fract( x );

  float id = 0.0;
    vec2 res = vec2( 100.0 );
    for( int k=-1; k<=1; k++ )
    for( int j=-1; j<=1; j++ )
    for( int i=-1; i<=1; i++ )
    {
        vec3 b = vec3( float(i), float(j), float(k) );
        vec3 r = vec3( b ) - f + hash( p + b );
        float d = dot( r, r );

        if( d < res.x )
        {
      id = dot( p+b, vec3(1.0,57.0,113.0 ) ); 
            res = vec2( d, res.x );			
        }
        else if( d < res.y )
        {
            res.y = d;
        }
    }

    return vec3( sqrt( res ), abs(id) );
}

float mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 perm(vec4 x){return mod289(((x * 34.0) + 1.0) * x);}

float noise(vec3 p) {
  vec3 a = floor(p);
  vec3 d = p - a;
  d = d * d * (3.0 - 2.0 * d);

  vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
  vec4 k1 = perm(b.xyxy);
  vec4 k2 = perm(k1.xyxy + b.zzww);

  vec4 c = k2 + a.zzzz;
  vec4 k3 = perm(c);
  vec4 k4 = perm(c + 1.0);

  vec4 o1 = fract(k3 * (1.0 / 41.0));
  vec4 o2 = fract(k4 * (1.0 / 41.0));

  vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
  vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);

  return o4.y * d.y + o4.x * (1.0 - d.y);
}

float hash1( float n ) {
    return fract( n*17.0*fract( n*0.3183099 ) );
}

float noise1( in vec3 x ) {
    vec3 p = floor(x);
    vec3 w = fract(x);
    
    vec3 u = w*w*w*(w*(w*6.0-15.0)+10.0);
    
    float n = p.x + 317.0*p.y + 157.0*p.z;
    
    float a = hash1(n+0.0);
    float b = hash1(n+1.0);
    float c = hash1(n+317.0);
    float d = hash1(n+318.0);
    float e = hash1(n+157.0);
    float f = hash1(n+158.0);
    float g = hash1(n+474.0);
    float h = hash1(n+475.0);

    float k0 =   a;
    float k1 =   b - a;
    float k2 =   c - a;
    float k3 =   e - a;
    float k4 =   a - b - c + d;
    float k5 =   a - c - e + g;
    float k6 =   a - b - e + f;
    float k7 = - a + b + c - d + e - f - g + h;

    return -1.0+2.0*(k0 + k1*u.x + k2*u.y + k3*u.z + k4*u.x*u.y + k5*u.y*u.z + k6*u.z*u.x + k7*u.x*u.y*u.z);
}

const mat3 m3  = mat3( 0.00,  0.80,  0.60,
                    -0.80,  0.36, -0.48,
                    -0.60, -0.48,  0.64 );

float fbm_4( in vec3 x ) {
    float f = 2.0;
    float s = 0.5;
    float a = 0.0;
    float b = 0.5;
    for( int i=0; i<4; i++ )
    {
        float n = noise(x);
        a += b*n;
        b *= s;
        x = f*m3*x;
    }
	return a;
}

mat3 calcLookAtMatrix(vec3 origin, vec3 target, float roll) {
    vec3 rr = vec3(sin(roll), cos(roll), 0.0);
    vec3 ww = normalize(target - origin);
    vec3 uu = normalize(cross(ww, rr));
    vec3 vv = normalize(cross(uu, ww));

    return mat3(uu, vv, ww);
}

struct Result {
  vec3 samplePos;
  float distortion;
  vec3 vor;
  float detail;
  float height;
  vec3 op;
  float erosion_value;
};

Result sample(vec3 p, const float wl, const float total_amplitude) {
  Result r;

  r.samplePos = p;
  r.distortion = fbm_4(p*voronoi_distortion_scale);
  r.vor = voronoi(p*voronoi_scale + (r.distortion-0.5)*voronoi_distortion_amplitude);
  r.detail = fbm_4(p*detail_scale);
  r.height = (r.vor.x-0.5)*voronoi_amplitude +(r.detail-0.5)*detail_amplitude;

  float th = r.height - wl;
  float thf;
  if (th > 0.0) 
    thf = total_amplitude-wl;
  else {
    thf = wl-radius;
  }

  th /= thf;
  th = pow(th, erosion);
  r.erosion_value = th;
  th *= thf;
  r.height = wl + th;

  if (render_water > 0.0) {
    p *= radius + max(r.height, wl);
  }
  else {
    p *= radius + r.height;
  }

  r.op = p;
  return r;
}

Result sample2(vec2 a, const float wl, const float total_amplitude, mat3 lookAt) {
  vec3 pp = lookAt * vec3(cos(a.x)*sin(a.y), sin(a.x)*sin(a.y), cos(a.y));
  return sample( pp,wl, total_amplitude);
}

void main() {
  vec3 cam = (inverseModelMatrix * vec4(cameraPosition,1.0)).xyz;
  mat3 lookAt = calcLookAtMatrix(vec3(0.0), cam, 0.0);

  float total_amplitude = voronoi_amplitude+detail_amplitude;
  float wl = total_amplitude*(water_level - 0.5);

  vec3 p = position + vec3(0.5,0.5,0.0);
  p /= vec3(ares.xy,1.0);
  float y = floor(aIdx / ares.x)/ares.y;
  float x = mod(aIdx, ares.x)/ares.x;
  vec2 p2 = vec2((x+p.x) * PI * 2.0 , (y+p.y)*angle);

  Result acc = sample2(p2, wl, total_amplitude, lookAt);
  vec3 r1 = acc.op;
  samplePos = acc.samplePos;

  float count = 1.0;
  vec3 samples[SAMPLES==0?1:SAMPLES];
  if (multisampling > 0.0 && SAMPLES > 0) {
    float s = SAMPLES==0?0.000001:float(SAMPLES);
    for (int i = 0; i < SAMPLES; i++) {
      float a = PI*2.0/s*float(i)+PI/s;

      Result r = sample2(p2 + vec2(sin(a)/(ares.x*ares.z), cos(a)/(ares.y*ares.z)*angle)*1.414, wl, total_amplitude, lookAt);
      acc.vor += r.vor;
      acc.height += r.height;
      acc.distortion += r.distortion;
      acc.detail += r.detail;
      acc.op += r.op;
      acc.erosion_value += r.erosion_value;
      samples[i] = normalize(r.op-r1);
    }
    count += float(SAMPLES);
  }

  acc.vor /= count;
  acc.height /= count;
  acc.distortion /= count;
  acc.detail /= count;
  acc.op /= count;
  acc.erosion_value /= count;


  vor = acc.vor;
  height = acc.height;
  distortion = acc.distortion;
  detail = acc.detail;
  op = acc.op;
  erosion_value = acc.erosion_value;

  if (smoothShading > 0.0 && multisampling > 0.0 && SAMPLES > 3) {
    norm = normalize(cross(samples[0],samples[1])); 
    norm += normalize(cross(samples[1],samples[2])); 
    norm += normalize(cross(samples[2],samples[3])); 
    norm += normalize(cross(samples[3],samples[0])); 
    norm /= -4.0;

    norm = normalMatrix * norm;
  }
  
  viewPosition =  modelViewMatrix * vec4(op, 1.0);
  gl_Position = projectionMatrix * viewPosition;
}
