// Demo league bios for the player sheet's header: [age, height in inches, weight, years in the league, college, jersey].
// The demo league uses real NFL names with made-up projections; these bios are illustrative fixtures for the 2026 demo
// season, kept plausible and consistent with each other (age tracks years in the league, 2025 rookies have 1). A live
// league never reads this file: its bios come from Sleeper through /api/player-bio.
export type DemoBio = [number, number, number, number, string, number];

export const DEMO_BIO: Record<string, DemoBio> = {
  // QB
  "Josh Allen": [30, 77, 237, 8, "Wyoming", 17], "Lamar Jackson": [29, 74, 205, 8, "Louisville", 8], "Patrick Mahomes": [31, 74, 225, 9, "Texas Tech", 15],
  "Jalen Hurts": [28, 73, 223, 6, "Oklahoma", 1], "Joe Burrow": [29, 76, 215, 6, "LSU", 9], "Jared Goff": [32, 76, 217, 10, "California", 16],
  "Dak Prescott": [33, 74, 238, 10, "Mississippi State", 4], "Brock Purdy": [26, 73, 220, 4, "Iowa State", 13], "Bo Nix": [26, 74, 214, 2, "Oregon", 10],
  "Caleb Williams": [24, 73, 214, 2, "USC", 18], "Drake Maye": [24, 76, 225, 2, "North Carolina", 10], "Jordan Love": [27, 76, 219, 6, "Utah State", 10],
  "Trevor Lawrence": [27, 78, 220, 5, "Clemson", 16], "Sam Darnold": [29, 75, 225, 8, "USC", 14], "Tyler Shough": [27, 77, 219, 1, "Louisville", 6],
  "Mason Rudolph": [31, 77, 235, 8, "Oklahoma State", 2],
  // RB
  "Bijan Robinson": [24, 71, 215, 3, "Texas", 7], "Jahmyr Gibbs": [24, 69, 200, 3, "Alabama", 0], "Christian McCaffrey": [30, 71, 210, 9, "Stanford", 23],
  "Saquon Barkley": [29, 72, 232, 8, "Penn State", 26], "Derrick Henry": [32, 75, 247, 10, "Alabama", 22], "Jonathan Taylor": [27, 70, 226, 6, "Wisconsin", 28],
  "James Cook": [27, 71, 190, 4, "Georgia", 4], "Breece Hall": [25, 71, 217, 4, "Iowa State", 20], "Kyren Williams": [26, 69, 194, 4, "Notre Dame", 23],
  "Josh Jacobs": [28, 70, 223, 7, "Alabama", 8], "Chase Brown": [26, 71, 209, 3, "Illinois", 30], "Aaron Jones": [31, 69, 208, 9, "UTEP", 33],
  "Alvin Kamara": [31, 70, 215, 9, "Tennessee", 41], "Ashton Jeanty": [22, 68, 211, 1, "Boise State", 2], "Bhayshul Tuten": [24, 71, 206, 1, "Virginia Tech", 33],
  "Bucky Irving": [24, 69, 192, 2, "Oregon", 7], "Cam Skattebo": [24, 70, 219, 1, "Arizona State", 44], "Chuba Hubbard": [27, 73, 210, 5, "Oklahoma State", 30],
  "D'Andre Swift": [27, 68, 215, 6, "Georgia", 4], "David Montgomery": [29, 71, 224, 7, "Iowa State", 5], "Isiah Pacheco": [27, 70, 216, 4, "Rutgers", 10],
  "Jacory Croskey-Merritt": [25, 71, 206, 1, "Arizona", 22], "Javonte Williams": [26, 70, 220, 5, "North Carolina", 33], "Jaylen Warren": [27, 68, 215, 4, "Oklahoma State", 30],
  "Jaylen Wright": [23, 71, 210, 2, "Tennessee", 25], "Kareem Hunt": [31, 71, 216, 9, "Toledo", 29], "Kenneth Walker III": [26, 69, 211, 4, "Michigan State", 9],
  "Kyle Monangai": [24, 68, 211, 1, "Rutgers", 25], "Omarion Hampton": [23, 72, 221, 1, "North Carolina", 28], "Quinshon Judkins": [22, 71, 221, 1, "Ohio State", 10],
  "Rachaad White": [27, 72, 214, 4, "Arizona State", 1], "Rhamondre Stevenson": [28, 72, 230, 5, "Oklahoma", 38], "Rico Dowdle": [28, 71, 215, 6, "South Carolina", 23],
  "Tank Bigsby": [25, 72, 210, 3, "Auburn", 4], "Tony Pollard": [29, 72, 209, 7, "Memphis", 20], "Travis Etienne": [27, 70, 215, 5, "Clemson", 1],
  "TreVeyon Henderson": [24, 70, 202, 1, "Ohio State", 32], "Woody Marks": [25, 70, 207, 1, "USC", 27], "Zach Charbonnet": [25, 73, 214, 3, "UCLA", 26],
  "Brian Robinson Jr.": [27, 73, 225, 4, "Alabama", 4], "Sean Tucker": [24, 69, 205, 3, "Syracuse", 44], "Tyjae Spears": [25, 70, 201, 3, "Tulane", 2],
  // WR
  "A.J. Brown": [29, 73, 226, 7, "Ole Miss", 11], "Amon-Ra St. Brown": [27, 72, 202, 5, "USC", 14], "Ashton Dulin": [29, 73, 215, 7, "Malone", 16],
  "Brandon Aiyuk": [28, 72, 200, 6, "Arizona State", 11], "Calvin Ridley": [31, 73, 190, 8, "Alabama", 0], "Cedric Tillman": [26, 75, 213, 3, "Tennessee", 19],
  "CeeDee Lamb": [27, 74, 200, 6, "Oklahoma", 88], "Chris Olave": [26, 73, 187, 4, "Ohio State", 12], "Christian Watson": [27, 76, 208, 4, "North Dakota State", 9],
  "Courtland Sutton": [31, 76, 216, 8, "SMU", 14], "Davante Adams": [33, 73, 215, 12, "Fresno State", 17], "DeVonta Smith": [27, 72, 170, 5, "Alabama", 6],
  "Deebo Samuel": [30, 72, 215, 7, "South Carolina", 1], "Drake London": [25, 76, 213, 4, "USC", 5], "Emeka Egbuka": [24, 73, 202, 1, "Ohio State", 2],
  "Garrett Wilson": [26, 72, 192, 4, "Ohio State", 5], "George Pickens": [25, 75, 200, 4, "Georgia", 3], "Ja'Marr Chase": [26, 72, 201, 5, "LSU", 1],
  "Jakobi Meyers": [29, 74, 200, 7, "NC State", 16], "Jalen Coker": [25, 75, 213, 2, "Holy Cross", 18], "Jameson Williams": [25, 74, 179, 4, "Alabama", 9],
  "Jauan Jennings": [29, 75, 212, 6, "Tennessee", 15], "Jaxon Smith-Njigba": [24, 72, 197, 3, "Ohio State", 11], "Jayden Reed": [26, 71, 187, 3, "Michigan State", 11],
  "Jaylen Waddle": [27, 70, 182, 5, "Alabama", 17], "Jerry Jeudy": [27, 73, 193, 6, "Alabama", 3], "Jordan Addison": [24, 71, 175, 3, "USC", 3],
  "Josh Downs": [25, 70, 171, 3, "North Carolina", 1], "Justin Jefferson": [27, 73, 195, 6, "LSU", 18], "Kalif Raymond": [32, 68, 182, 10, "Holy Cross", 11],
  "Keon Coleman": [23, 76, 213, 2, "Florida State", 0], "Khalil Shakir": [26, 72, 190, 4, "Boise State", 10], "Ladd McConkey": [24, 72, 186, 2, "Georgia", 15],
  "Luther Burden": [22, 72, 206, 1, "Missouri", 10], "Malik Nabers": [23, 72, 200, 2, "LSU", 1], "Marvin Harrison Jr.": [24, 75, 209, 2, "Ohio State", 18],
  "Matthew Golden": [23, 71, 191, 1, "Texas", 0], "Michael Wilson": [26, 74, 213, 3, "Stanford", 14], "Mike Evans": [33, 77, 231, 12, "Texas A&M", 13],
  "Nico Collins": [27, 76, 222, 5, "Michigan", 12], "Parker Washington": [24, 70, 204, 3, "Penn State", 11], "Puka Nacua": [25, 74, 210, 3, "BYU", 12],
  "Rashee Rice": [26, 74, 204, 3, "SMU", 4], "Rashid Shaheed": [28, 72, 180, 4, "Weber State", 22], "Romeo Doubs": [26, 74, 204, 4, "Nevada", 87],
  "Stefon Diggs": [32, 72, 191, 11, "Maryland", 8], "Tee Higgins": [27, 76, 219, 6, "Clemson", 5], "Terry McLaurin": [31, 72, 210, 7, "Ohio State", 17],
  "Tetairoa McMillan": [23, 76, 219, 1, "Arizona", 4], "Wan'Dale Robinson": [25, 68, 185, 4, "Kentucky", 17], "Xavier Worthy": [23, 71, 172, 2, "Texas", 1],
  "Zay Flowers": [26, 69, 182, 3, "Boston College", 4], "Jalen Tolbert": [27, 73, 194, 4, "South Alabama", 1], "Dont'e Thornton": [23, 77, 205, 0, "Tennessee", 10],
  // TE
  "Brenton Strange": [26, 76, 253, 3, "Penn State", 85], "Brock Bowers": [23, 75, 230, 2, "Georgia", 89], "Cade Otton": [27, 77, 247, 4, "Washington", 88],
  "Colston Loveland": [22, 78, 248, 1, "Michigan", 84], "Dallas Goedert": [31, 77, 256, 8, "South Dakota State", 88], "Dalton Kincaid": [27, 76, 240, 3, "Utah", 86],
  "Dalton Schultz": [30, 77, 242, 8, "Stanford", 86], "Evan Engram": [32, 75, 240, 9, "Ole Miss", 1], "George Kittle": [33, 76, 250, 9, "Iowa", 85],
  "Hunter Henry": [31, 77, 250, 10, "Arkansas", 85], "Isaiah Likely": [26, 76, 245, 4, "Coastal Carolina", 80], "Jake Ferguson": [27, 77, 244, 4, "Wisconsin", 87],
  "Juwan Johnson": [30, 76, 231, 6, "Oregon", 83], "Mark Andrews": [31, 77, 256, 8, "Oklahoma", 89], "Mason Taylor": [22, 77, 251, 1, "LSU", 85],
  "Mike Gesicki": [31, 78, 247, 8, "Penn State", 88], "Pat Freiermuth": [28, 77, 258, 5, "Penn State", 88], "Sam LaPorta": [25, 75, 245, 3, "Iowa", 87],
  "Theo Johnson": [25, 78, 259, 2, "Penn State", 84], "Travis Kelce": [37, 77, 250, 13, "Cincinnati", 87], "Trey McBride": [26, 75, 246, 4, "Colorado State", 85],
  "Tucker Kraft": [25, 77, 259, 3, "South Dakota State", 85], "Tyler Warren": [24, 78, 256, 1, "Penn State", 84], "Zach Ertz": [35, 77, 250, 13, "Stanford", 86],
  "Chig Okonkwo": [27, 75, 238, 4, "Maryland", 85],
  // K
  "Brandon Aubrey": [31, 75, 207, 3, "Notre Dame", 17], "Cameron Dicker": [26, 73, 215, 4, "Texas", 11], "Jake Bates": [27, 74, 225, 2, "Arkansas", 39],
  "Chris Boswell": [35, 74, 185, 12, "Rice", 9], "Ka'imi Fairbairn": [32, 72, 183, 10, "UCLA", 7], "Tyler Bass": [29, 70, 183, 6, "Georgia Southern", 2],
  "Harrison Butker": [31, 76, 196, 9, "Georgia Tech", 7], "Jason Myers": [35, 70, 190, 11, "Marist", 5], "Wil Lutz": [32, 71, 184, 10, "Georgia State", 3],
  "Jake Elliott": [31, 69, 167, 9, "Memphis", 4], "Chase McLaughlin": [30, 70, 190, 7, "Illinois", 4], "Evan McPherson": [27, 71, 185, 5, "Florida", 2],
  "Cairo Santos": [34, 68, 160, 12, "Tulane", 8],
};
