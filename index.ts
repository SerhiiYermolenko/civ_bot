import { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    ChatInputCommandInteraction,
    AutocompleteInteraction
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

type KnownCivilization = {
    name: string;
    aliases?: string[]; // for some Civs we want to support multiple names as an input (e.g Zulu / Zulus)
}

const civilizations: KnownCivilization[] = [
    { name: "America", aliases: ["American"] },
    { name: "Arabia", aliases: ["Arabian"] },
    { name: "Assyria", aliases: ["Assyrian"] },
    { name: "Austria", aliases: ["Austrian"] },
    { name: "Aztec", aliases: [] },
    { name: "Babylon", aliases: ["Babylonian"] },
    { name: "Brazil", aliases: ["Brazilian"] },
    { name: "Byzantium", aliases: ["Byzantine"] },
    { name: "Carthage", aliases: ["Carthaginian"] },
    { name: "Celtic", aliases: [] },
    { name: "China", aliases: ["Chinese"] },
    { name: "Denmark", aliases: ["Danish"] },
    { name: "Egypt", aliases: ["Egyptian"] },
    { name: "England", aliases: ["English"] },
    { name: "Ethiopia", aliases: ["Ethiopian"] },
    { name: "France", aliases: ["French"] },
    { name: "Germany", aliases: ["German"] },
    { name: "Greece", aliases: ["Greek"] },
    { name: "Huns", aliases: ["Hunnic"] },
    { name: "Inca", aliases: ["Incan"] },
    { name: "India", aliases: ["Indian"] },
    { name: "Indonesia", aliases: ["Indonesian"] },
    { name: "Iroquois", aliases: ["Iroquois"] },
    { name: "Japan", aliases: ["Japanese"] },
    { name: "Korea", aliases: ["Korean"] },
    { name: "Maya", aliases: ["Mayan"] },
    { name: "Mongolia", aliases: ["Mongolian", "Mongols"] },
    { name: "Morocco", aliases: ["Moroccan"] },
    { name: "Netherlands", aliases: ["Dutch"] },
    { name: "Ottoman", aliases: [] },
    { name: "Persia", aliases: ["Persian"] },
    { name: "Poland", aliases: ["Polish"] },
    { name: "Polynesia", aliases: ["Polynesian"] },
    { name: "Portugal", aliases: ["Portuguese"] },
    { name: "Rome", aliases: ["Roman"] },
    { name: "Russia", aliases: ["Russian"] },
    { name: "Shoshone", aliases: [] },
    { name: "Siam", aliases: ["Siamese"] },
    { name: "Songhai", aliases: [] },
    { name: "Spain", aliases: ["Spanish†"] },
    { name: "Sweden", aliases: ["Swedish"] },
    { name: "Venice", aliases: ["Venetian"] },
    { name: "Zulu", aliases: ["Zulus"] },
];

const civilizationKnownNames = new Set([
    ...civilizations.map(c => c.name),
    ...civilizations.map(c => c.aliases || []).flat(),
]);

function convertCivPotentialNameToName(civString: string) {
    const lowercased = civString.toLowerCase();
    const matchedCiv = civilizations.find(civ => {
        const matchedByName = civ.name.toLowerCase() === lowercased
        const matchedByAlias = civ.aliases?.map(al => al.toLowerCase()).includes(lowercased);
        return matchedByName || matchedByAlias;
    });
    return matchedCiv?.name ?? '';
}

function isKnownCivName(civString: string) {
    return civilizationKnownNames.has(civString);
}

let bannedCivs: string[] = [];

function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getPlayerChoices(playerCount: number, availableCivs: string[]): string[][] {
    const shuffledCivs = shuffleArray([...availableCivs]);
    const playerChoices: string[][] = [];

    for (let i = 0; i < playerCount; i++) {
        playerChoices.push(shuffledCivs.slice(i * 3, (i + 1) * 3));
    }

    return playerChoices;
}

const commands = [
    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll civilizations for players')
        .addIntegerOption(option => 
            option.setName('players')
                .setDescription('Number of players')
                .setRequired(true)
                .setMinValue(2)
                .setMaxValue(8))
        .addStringOption(option => 
            option.setName('names')
                .setDescription('Player names (comma-separated)')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban civilizations for the next roll')
        .addStringOption(option =>
            option.setName('civilizations')
                .setDescription('Civilizations to ban (comma-separated)')
                .setRequired(true)
                .setAutocomplete(true))
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID!),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

client.on('ready', () => {
    console.log(`Logged in as ${client.user!.tag}!`);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'roll') {
        await handleRollCommand(interaction);
    } else if (interaction.commandName === 'ban') {
        await handleBanCommand(interaction);
    }
});

async function handleAutocomplete(interaction: AutocompleteInteraction) {
    // discord.js doesn't support multi-select autocomplete, so we need to handle it manually
    // we take the last bit of the input (separated by commas), and concat it with all previous inputs
    const focusedValue = interaction.options.getFocused().toString();
    const inputValues = focusedValue.split(",").map((v) => v.trim());
    const lastInput = inputValues[inputValues.length - 1].toLowerCase();
    // Get all previously selected civs (everything except the last input)
    const previousSelections = inputValues
      .slice(0, -1)
      .filter((v) => v.length > 0);
    const alreadyEnteredCivs = new Set(
      previousSelections.map((v) => v.toLowerCase())
    );
    const availableCivs = civilizations
      .map((civ) => civ.name)
      .filter((civ) => !alreadyEnteredCivs.has(civ.toLowerCase()));
    const filtered = availableCivs.filter((civ) =>
      civ.toLowerCase().startsWith(lastInput)
    );
    await interaction.respond(
      filtered.slice(0, 25).map((choice) => {
        const valueWithPreviousSelections = [...previousSelections, choice].join(
          ", "
        );
        return {
          name: valueWithPreviousSelections,
          value: valueWithPreviousSelections,
        };
      })
    );
  }

async function handleRollCommand(interaction: ChatInputCommandInteraction) {
    const playerCount = interaction.options.getInteger('players', true);
    const playerNamesInput = interaction.options.getString('names');

    let playerNames: string[];
    if (playerNamesInput) {
        playerNames = playerNamesInput.split(',').map(name => name.trim());
        if (playerNames.length !== playerCount) {
            await interaction.reply(`You specified ${playerCount} players but provided ${playerNames.length} names. Using default player names instead.`);
            playerNames = Array.from({length: playerCount}, (_, i) => `Player ${i + 1}`);
        }
    } else {
        playerNames = Array.from({length: playerCount}, (_, i) => `Player ${i + 1}`);
    }

    const availableCivs = civilizations
        .map(civ => civ.name)
        .filter(civ => !bannedCivs.includes(civ));
    const choices = getPlayerChoices(playerCount, availableCivs);

    let response = 'Civilization choices for each player:\n';
    choices.forEach((playerChoices, index) => {
        response += `${playerNames[index]}: ${playerChoices.join(', ')}\n`;
    });

    if (bannedCivs.length > 0) {
        response += `\nBanned civilizations: ${bannedCivs.join(', ')}`;
        bannedCivs = []; // Reset banned civs after the roll
    }

    await interaction.reply(response);
}

async function handleBanCommand(interaction: ChatInputCommandInteraction) {
    const civsToBan = interaction.options
        .getString('civilizations', true)
        .split(',')
        .map(name => name.trim())
        .map(potentialName => convertCivPotentialNameToName(potentialName));
    
    const invalidCivs = civsToBan.filter(civ => !isKnownCivName(civ));
    if (invalidCivs.length > 0) {
        await interaction.reply(`The following civilizations are not recognized: ${invalidCivs.join(', ')}`);
        return;
    }

    bannedCivs = [...new Set([...bannedCivs, ...civsToBan])]; // Add new bans, ensure uniqueness
    await interaction.reply(`Banned civilizations for the next roll: ${bannedCivs.join(', ')}`);
}

client.login(process.env.DISCORD_TOKEN);