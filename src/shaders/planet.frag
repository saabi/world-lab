
varying vec3 vor;
varying float detail;
varying float distortion;
varying float height;
varying vec3 op;
varying float erosion_value;
varying vec3 norm;
varying vec4 viewPosition;

uniform float time;
uniform float radius;
uniform float voronoi_amplitude;
uniform float voronoi_albedo;
uniform float voronoi_albedo_y;
uniform float voronoi_albedo_z;
uniform float voronoi_distortion_albedo;
uniform float detail_amplitude;
uniform float detail_albedo;
uniform float render_water;
uniform float water_level;
uniform float sand_cutoff;
uniform float vegetation_level;
uniform float snow_cover;
uniform float texture_noise_scale;
uniform float texture_noise_amplitude;
uniform float polar_scale;
uniform float polar_amplitude;
uniform float illumination;

const vec3 ROCK = vec3(0.50, 0.35, 0.15);
const vec3 TREE = vec3(0.05, 1.15, 0.10);
const vec3 SAND = vec3(1.00, 1.00, 0.85);
const vec3 ICE  = vec3(0.85, 1.00, 1.20);
const vec3 SHALLOW_WATER = vec3(0.4, 1.0, 1.9);
const vec3 DEEP_WATER = vec3(0, 0.1, 0.7);

const vec3 SUN_POS = vec3(10000.0, 0.0, 0.0);

vec3 hash( vec3 x )
{
	x = vec3( dot(x,vec3(127.1,311.7, 74.7)),
			  dot(x,vec3(269.5,183.3,246.1)),
			  dot(x,vec3(113.5,271.9,124.6)));

	return fract(sin(x)*43758.5453123);
}

vec3 voronoi( in vec3 x )
{
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

float noise(vec3 p){
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

float hash1( float n )
{
    return fract( n*17.0*fract( n*0.3183099 ) );
}

float noise1( in vec3 x )
{
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

float fbm_4( in vec3 x )
{
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

void main() {
	vec3 v = vor;
	vec3 col;

  float spots = vor.x*(1.0-voronoi_albedo) + voronoi_albedo;
  spots *= vor.y*(1.0-voronoi_albedo_y) + voronoi_albedo_y;
  spots *= vor.z*(1.0-voronoi_albedo_z) + voronoi_albedo_z;
  spots *= distortion*(1.0-voronoi_distortion_albedo) + voronoi_distortion_albedo;
  spots *= detail*(1.0-detail_albedo) + detail_albedo;

  float total_amplitude = voronoi_amplitude+detail_amplitude;

  col = ROCK * vec3(spots);

  float tn = (fbm_4(op*sqrt(texture_noise_scale))-0.5)*texture_noise_amplitude;
	float polar = ((abs(op.y)/radius)-polar_scale)*polar_amplitude;
	float h = height + tn + polar;

  float tl = h / total_amplitude;

	if (tl < pow(vegetation_level,2.)) {
		col = TREE * vec3(spots);
	}

  if (tl < pow(sand_cutoff,2.))
    col = SAND * vec3(spots);

  float l = (total_amplitude)*(water_level - 0.5);
	if (render_water > 0.0 && height <= l) {
		float depth = spots;
		depth = sqrt(depth);
		col = mix(SHALLOW_WATER, DEEP_WATER, depth);
	}

	if (tl > pow(snow_cover,2.)) {
		col = ICE+tl;
    if (render_water > 0.0 && height > l)
      col *= vec3(spots);
	}

  if (illumination > 0.0) {
    vec3 n = normalize( cross( dFdx( viewPosition.xyz ), dFdy( viewPosition.xyz ) ) );
    //vec3 n = norm;
    vec4 sp = viewMatrix * vec4(SUN_POS,1.0);
    vec3 lightDir = normalize(sp.xyz - op);
    float diff = max(dot(n, lightDir), 0.0);
    col *= diff;
  }

	gl_FragColor = vec4( col, 1.0 );
	//gl_FragColor = vec4(norm, 1.0);
}