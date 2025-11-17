import axios from "axios";

export const getOpenSkyToken = async (): Promise<string> => {
  const CLIENT_ID = process.env.OPENSKY_CLIENT_ID;
  const CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("inloggegevens fout is ontbreek");
  }

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", CLIENT_ID);
  params.append("client_secret", CLIENT_SECRET);

  const response = await axios.post(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    params,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data.access_token;
};
// hier fetch ik alle data van deo open sky
export const fetchFlights = async () => {
  const token = await getOpenSkyToken();

  const response = await axios.get(
    "https://opensky-network.org/api/states/all",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const allStates: OpenSkyState[] = response.data.states || [];

  const filteredStates = allStates.filter((s) => {
    const lon = s[5];
    const lat = s[6];
    return (
      typeof lat === "number" &&
      typeof lon === "number" &&
      lat >= 50 &&
      lat <= 54 &&
      lon >= 3 &&
      lon <= 8
    );
  });
  return { ...response.data, states: filteredStates };
};
//alle typesd die defineer
type OpenSkyState = [
  string, // icao24
  string | null, // callsign
  string, // origin_country
  number | null, // time_position
  number | null, // last_contact
  number | null, // longitude
  number | null, // latitude
  number | null, // baro_altitude
  boolean, // on_ground
  number | null, // velocity
  number | null, // true_track
  number | null, // vertical_rate
  number[] | null, // sensors
  number | null, // geo_altitude
  string, // squawk
  boolean, // spi
  number // position_source
];
