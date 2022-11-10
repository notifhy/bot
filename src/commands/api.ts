import { EmbedLimits } from '@sapphire/discord-utilities';
import { type ApplicationCommandRegistry, BucketScope, Command } from '@sapphire/framework';
import { type CommandInteraction, Constants } from 'discord.js';
import { BetterEmbed } from '../structures/BetterEmbed';
import { Options } from '../utility/Options';
import { cleanLength, interactionLogContext } from '../utility/utility';

type ErrorTypes = 'abort' | 'generic' | 'http' | 'rateLimit';

type TimeoutSettables = 'timeout' | 'resumeAfter';

export class APICommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            name: 'api',
            description: 'Toggles dynamic settings',
            cooldownLimit: 0,
            cooldownDelay: 0,
            cooldownScope: BucketScope.User,
            preconditions: ['Base', 'DevMode', 'OwnerOnly'],
            requiredUserPermissions: [],
            requiredClientPermissions: [],
        });

        this.chatInputStructure = {
            name: this.name,
            description: this.description,
            options: [
                {
                    name: 'stats',
                    type: Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
                    description: 'Returns some stats about the API Request Handler',
                },
                {
                    name: 'set',
                    type: Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
                    description: 'Set data for the API Request Handler',
                    options: [
                        {
                            name: 'category',
                            type: Constants.ApplicationCommandOptionTypes.STRING,
                            description: 'The category to execute on',
                            required: true,
                            choices: [
                                {
                                    name: 'abort',
                                    value: 'abort',
                                },
                                {
                                    name: 'generic',
                                    value: 'generic',
                                },
                                {
                                    name: 'http',
                                    value: 'http',
                                },
                            ],
                        },
                        {
                            name: 'type',
                            type: Constants.ApplicationCommandOptionTypes.STRING,
                            description: 'The category to execute on',
                            required: true,
                            choices: [
                                {
                                    name: 'pauseFor',
                                    value: 'pauseFor',
                                },
                                {
                                    name: 'resumeAfter',
                                    value: 'resumeAfter',
                                },
                                {
                                    name: 'timeout',
                                    value: 'timeout',
                                },
                            ],
                        },
                        {
                            name: 'value',
                            type: Constants.ApplicationCommandOptionTypes.NUMBER,
                            description: 'An integer as an input',
                            required: true,
                            min_value: 0,
                        },
                    ],
                },
                {
                    name: 'call',
                    type: Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
                    description: 'Call a function from the API Request Handler',
                    options: [
                        {
                            name: 'method',
                            type: Constants.ApplicationCommandOptionTypes.STRING,
                            description: 'The method to call',
                            required: true,
                            choices: [
                                {
                                    name: 'addAbort()',
                                    value: 'addAbort',
                                },
                                {
                                    name: 'addGeneric()',
                                    value: 'addGeneric',
                                },
                                {
                                    name: 'addHTTP()',
                                    value: 'addHTTP',
                                },
                            ],
                        },
                    ],
                },
            ],
        };
    }

    public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
        registry.registerChatInputCommand(this.chatInputStructure, Options.commandRegistry(this));
    }

    public override async chatInputRun(interaction: CommandInteraction) {
        switch (interaction.options.getSubcommand()) {
            case 'stats':
                await this.stats(interaction);
                break;
            case 'set':
                await this.set(interaction);
                break;
            case 'call':
                await this.call(interaction);
                break;
            default:
                throw new RangeError();
        }
    }

    public async stats(interaction: CommandInteraction) {
        const { i18n } = interaction;

        const { abort, generic, http, getTimeout } = this.container.core.errors;

        const { fetches } = this.container.core.requests;

        const statsEmbed = new BetterEmbed(interaction)
            .setColor(Options.colorsNormal)
            .setDescription(
                JSON.stringify(this.container.core.performance).slice(
                    0,
                    EmbedLimits.MaximumDescriptionLength,
                ),
            )
            .addFields(
                {
                    name: i18n.getMessage('commandsAPIStatsEnabledName'),
                    value: i18n.getMessage(this.container.config.core ? 'yes' : 'no'),
                },
                {
                    name: i18n.getMessage('commandsAPIStatsResumeName'),
                    value: getTimeout() ? cleanLength(getTimeout())! : i18n.getMessage('null'),
                },
                {
                    name: i18n.getMessage('commandsAPIStatsLastHourName'),
                    value: i18n.getMessage('commandsAPIStatsLastHourValue', [
                        abort.getLastHour(),
                        generic.getLastHour(),
                        http.getLastHour(),
                    ]),
                },
                {
                    name: i18n.getMessage('commandsAPIStatsNextTimeoutsName'),
                    value: i18n.getMessage('commandsAPIStatsNextTimeoutsValue', [
                        cleanLength(abort.getTimeout()) ?? i18n.getMessage('null'),
                        cleanLength(generic.getTimeout()) ?? i18n.getMessage('null'),
                        cleanLength(http.getTimeout()) ?? i18n.getMessage('null'),
                    ]),
                },
                {
                    name: i18n.getMessage('commandsAPIStatsFetchesName'),
                    value: String(fetches),
                },
            );

        await interaction.editReply({
            embeds: [statsEmbed],
        });
    }

    public async set(interaction: CommandInteraction) {
        const { i18n } = interaction;

        const category = interaction.options.getString('category', true) as ErrorTypes;
        const type = interaction.options.getString('type', true);
        const value = interaction.options.getNumber('value', true);

        this.container.core.errors[category][type as TimeoutSettables] = value;

        const setEmbed = new BetterEmbed(interaction)
            .setColor(Options.colorsNormal)
            .setTitle(i18n.getMessage('commandsAPISetTitle'))
            .setDescription(i18n.getMessage('commandsAPISetDescription', [category, type, value]));

        this.container.logger.info(
            interactionLogContext(interaction),
            `${this.constructor.name}:`,
            `<Core>.errors.${category}.${type} is now ${value}.`,
        );

        await interaction.editReply({
            embeds: [setEmbed],
        });
    }

    public async call(interaction: CommandInteraction) {
        const { i18n } = interaction;
        const method = interaction.options.getString('method', true);

        const hypixelModuleErrors = this.container.core.errors;

        if (
            method === 'addAbort'
            || method === 'addGeneric'
            || method === 'addHTTP'
            || method === 'addRateLimit'
        ) {
            hypixelModuleErrors[method]();
        }

        const callEmbed = new BetterEmbed(interaction)
            .setColor(Options.colorsNormal)
            .setTitle(i18n.getMessage('commandsAPICallTitle'))
            .setDescription(i18n.getMessage('commandsAPICallDescription', [method]));

        this.container.logger.info(
            interactionLogContext(interaction),
            `${this.constructor.name}:`,
            `Executed <Core>.errors.${method}.`,
        );

        await this.stats(interaction);
        await interaction.followUp({
            embeds: [callEmbed],
            ephemeral: true,
        });
    }
}
