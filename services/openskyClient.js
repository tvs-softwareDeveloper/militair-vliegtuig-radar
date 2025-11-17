"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchFlights = exports.getOpenSkyToken = void 0;
// src/api/openskyClient.ts
const axios_1 = __importDefault(require("axios"));
const getOpenSkyToken = async () => {
    const CLIENT_ID = process.env.OPENSKY_CLIENT_ID;
    const CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error("Client ID of secret is niet ingesteld in .env");
    }
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    const response = await axios_1.default.post('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', params, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });
    return response.data.access_token;
};
exports.getOpenSkyToken = getOpenSkyToken;
const fetchFlights = async () => {
    const token = await (0, exports.getOpenSkyToken)();
    const response = await axios_1.default.get('https://opensky-network.org/api/states/all', {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    return response.data;
};
exports.fetchFlights = fetchFlights;
//# sourceMappingURL=openskyClient.js.map