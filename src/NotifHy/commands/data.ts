import type { ClientCommand } from '../@types/client';
import type {
    DefenderModule,
    FriendsModule,
    RewardsModule,
    UserAPIData,
    UserData,
} from '../@types/database';
import {
    awaitComponent,
    disableComponents,
    setActivity,
} from '../utility/utility';
import {
    BetterEmbed,
    capitolToNormal,
    cleanGameMode,
    cleanGameType,
    timestamp,
} from '../../utility/utility';
import { Buffer } from 'node:buffer';
import { CommandErrorHandler } from '../errors/CommandErrorHandler';
import { Constants } from '../utility/Constants';
import {
    Constants as DiscordConstants,
    Message,
    MessageActionRow,
    MessageButton,
    MessageComponentInteraction,
} from 'discord.js';
import { GlobalConstants } from '../../utility/Constants';
import { Log } from '../../utility/Log';
import { RegionLocales } from '../locales/RegionLocales';
import { SQLite } from '../../utility/SQLite';

export const properties: ClientCommand['properties'] = {
    name: 'data',
    description: 'View or delete your data stored by this bot.',
    cooldown: 30_000,
    ephemeral: true,
    noDM: false,
    ownerOnly: false,
    requireRegistration: true,
    structure: {
        name: 'data',
        description: 'View or delete your data stored by this bot',
        options: [
            {
                name: 'delete',
                type: 1,
                description: 'Delete your data - there is a confirmation step to prevent accidents',
            },
            {
                name: 'view',
                description: 'View some or all of your player data',
                type: 2,
                options: [
                    {
                        name: 'all',
                        type: 1,
                        description: 'Returns a file with all of your player data',
                    },
                    {
                        name: 'history',
                        type: 1,
                        description:
                            'Returns an interface that shows your player history',
                    },
                ],
            },
        ],
    },
};

export const execute: ClientCommand['execute'] = async (
    interaction,
    locale,
): Promise<void> => {
    const text = RegionLocales.locale(locale).commands.data;
    const { replace } = RegionLocales;

    switch (interaction.options.getSubcommand()) {
        case 'delete':
            await dataDelete();
            break;
        case 'all':
            await viewAll();
            break;
        case 'history':
            await viewHistory();
        //No default
    }

    async function dataDelete() {
        const confirmEmbed = new BetterEmbed(interaction)
            .setColor(Constants.colors.normal)
            .setTitle(text.delete.confirm.title)
            .setDescription(text.delete.confirm.description);

        const yesButton = new MessageButton()
            .setCustomId('true')
            .setLabel(text.delete.yesButton)
            .setStyle(DiscordConstants.MessageButtonStyles.SUCCESS);

        const noButton = new MessageButton()
            .setCustomId('false')
            .setLabel(text.delete.noButton)
            .setStyle(DiscordConstants.MessageButtonStyles.DANGER);

        const buttonRow = new MessageActionRow().addComponents(
            yesButton,
            noButton,
        );

        const message = await interaction.editReply({
            embeds: [confirmEmbed],
            components: [buttonRow],
        }) as Message;

        const disabledRows = disableComponents(message.components);

        await interaction.client.channels.fetch(interaction.channelId);

        const componentFilter = (i: MessageComponentInteraction) =>
            interaction.user.id === i.user.id &&
            i.message.id === message.id;

        const button = await awaitComponent(
            interaction.channel!,
            'BUTTON',
            {
                filter: componentFilter,
                idle: GlobalConstants.ms.second * 30,
            },
        );

        if (button === null) {
            Log.interaction(interaction, 'Ran out of time');

            await interaction.editReply({
                components: disabledRows,
            });
        } else if (button.customId === 'true') {
            SQLite.createTransaction(() => {
                SQLite.deleteUser({
                    discordID: interaction.user.id,
                    table: Constants.tables.users,
                });

                SQLite.deleteUser({
                    discordID: interaction.user.id,
                    table: Constants.tables.api,
                });

                SQLite.deleteUser({
                    discordID: interaction.user.id,
                    table: Constants.tables.defender,
                });

                SQLite.deleteUser({
                    discordID: interaction.user.id,
                    table: Constants.tables.friends,
                });

                SQLite.deleteUser({
                    discordID: interaction.user.id,
                    table: Constants.tables.rewards,
                });
            });

            const deleted = new BetterEmbed(interaction)
                .setColor(Constants.colors.normal)
                .setTitle(text.delete.deleted.title)
                .setDescription(text.delete.deleted.description);

            Log.interaction(interaction, 'Accepted data deletion');

            await button.update({
                embeds: [deleted],
                components: disabledRows,
            });

            setActivity(interaction.client);
        } else {
            const aborted = new BetterEmbed(interaction)
                .setColor(Constants.colors.normal)
                .setTitle(text.delete.aborted.title)
                .setDescription(text.delete.aborted.description);

            Log.interaction(interaction, 'Aborted data deletion');

            await button.update({
                embeds: [aborted],
                components: disabledRows,
            });
        }
    }

    async function viewAll() {
        const userData = SQLite.getUser<UserData>({
            discordID: interaction.user.id,
            table: Constants.tables.users,
            allowUndefined: true,
            columns: ['*'],
        });

        const userAPIData = SQLite.getUser<UserAPIData>({
            discordID: interaction.user.id,
            table: Constants.tables.api,
            allowUndefined: true,
            columns: ['*'],
        });

        const defender = SQLite.getUser<DefenderModule>({
            discordID: interaction.user.id,
            table: Constants.tables.defender,
            allowUndefined: true,
            columns: ['*'],
        });

        const friends = SQLite.getUser<FriendsModule>({
            discordID: interaction.user.id,
            table: Constants.tables.friends,
            allowUndefined: true,
            columns: ['*'],
        });

        const rewards = SQLite.getUser<RewardsModule>({
            discordID: interaction.user.id,
            table: Constants.tables.rewards,
            allowUndefined: true,
            columns: ['*'],
        });

        const allUserData = {
            userData: userData,
            userAPIData: userAPIData,
            defender: defender,
            friends: friends,
            rewards: rewards,
        };

        await interaction.editReply({
            files: [
                {
                    attachment: Buffer.from(
                        JSON.stringify(allUserData, null, 2),
                    ),
                    name: 'userData.json',
                },
            ],
        });
    }

    async function viewHistory() {
        const userAPIData = SQLite.getUser<UserAPIData>({
            discordID: interaction.user.id,
            table: Constants.tables.api,
            columns: ['*'],
            allowUndefined: false,
        });

        const base = new MessageButton()
            .setStyle(
                DiscordConstants.MessageButtonStyles.PRIMARY,
            );

        const fastLeftButton = new MessageButton(base)
            .setCustomId('fastBackward')
            .setEmoji(Constants.emoji.fastBackward)
            .setDisabled(true);

        const leftButton = new MessageButton(base)
            .setCustomId('backward')
            .setEmoji(Constants.emoji.backward)
            .setDisabled(true);

        const rightButton = new MessageButton(base)
            .setCustomId('forward')
            .setEmoji(Constants.emoji.forward);

        const fastRightButton = new MessageButton(base)
            .setCustomId('fastForward')
            .setEmoji(Constants.emoji.fastForward);

        rightButton.disabled =
            userAPIData.history.length <= Constants.defaults.menuFastIncrements;

        fastRightButton.disabled =
            userAPIData.history.length <= Constants.defaults.menuIncrements;

        const keys = text.history.keys;
        const epoch = /^\d{13,}$/gm;

        const paginator = (position: number): BetterEmbed => {
            const data = userAPIData.history;
            const shownData = data.slice(
                position,
                position + Constants.defaults.menuIncrements,
            );

            //this is great
            const fields = shownData.map(({ date, ...event }) => ({
                name: `${timestamp(date, 'D')} ${timestamp(date, 'T')}`,
                value: Object.entries(event)
                    .map(
                        ([key, value]) =>
                            `${keys[key as keyof typeof keys]} ${String(value).match(epoch)
                                ? timestamp(value, 'T')
                                : (
                                    key === 'gameType'
                                        ? cleanGameType(value)
                                        : key === 'gameMode'
                                        ? cleanGameMode(value)
                                        : capitolToNormal(value)
                                ) ?? text.history.null}`,
                    )
                    .join('\n'),
            }));

            return new BetterEmbed(interaction)
                .setColor(Constants.colors.normal)
                .setTitle(text.history.embed.title)
                .setDescription(replace(text.history.embed.description, {
                    start: position >= userAPIData.history.length
                        ? position
                        : position + 1,
                    end: position + shownData.length,
                    total: userAPIData.history.length,
                    max: Constants.limits.userAPIDataHistory,
                }))
                .setFields(fields);
        };

        const buttons = new MessageActionRow()
            .setComponents(
                fastLeftButton,
                leftButton,
                rightButton,
                fastRightButton,
            );

        const reply = await interaction.editReply({
            embeds: [paginator(0)],
            components: [buttons],
        });

        await interaction.client.channels.fetch(interaction.channelId);

        const filter = (i: MessageComponentInteraction) =>
            interaction.user.id === i.user.id && i.message.id === reply.id;

        const collector = interaction.channel!.createMessageComponentCollector({
            filter: filter,
            idle: GlobalConstants.ms.minute * 5,
            time: GlobalConstants.ms.minute * 30,
        });

        let currentIndex = 0;

        collector.on('collect', async i => {
            try {
                switch (i.customId) {
                    case 'fastBackward':
                        currentIndex -= Constants.defaults.menuFastIncrements;
                        break;
                    case 'backward':
                        currentIndex -= Constants.defaults.menuIncrements;
                        break;
                    case 'forward':
                        currentIndex += Constants.defaults.menuIncrements;
                        break;
                    case 'fastForward':
                        currentIndex += Constants.defaults.menuFastIncrements;
                    //No default
                }

                fastLeftButton.disabled =
                    currentIndex - Constants.defaults.menuFastIncrements < 0;

                leftButton.disabled =
                    currentIndex - Constants.defaults.menuIncrements < 0;

                rightButton.disabled =
                    currentIndex + Constants.defaults.menuIncrements >=
                    userAPIData.history.length;

                fastRightButton.disabled =
                    currentIndex + Constants.defaults.menuFastIncrements >=
                    userAPIData.history.length;

                buttons.setComponents(
                    fastLeftButton,
                    leftButton,
                    rightButton,
                    fastRightButton,
                );

                await i.update({
                    embeds: [paginator(currentIndex)],
                    components: [buttons],
                });
            } catch (error) {
                await CommandErrorHandler.init(error, interaction, locale);
            }
        });

        collector.on('end', async () => {
            try {
                const message = (await interaction.fetchReply()) as Message;
                const actionRows = message.components;
                const disabledRows = disableComponents(actionRows);

                await interaction.editReply({
                    components: disabledRows,
                });
            } catch (error) {
                await CommandErrorHandler.init(error, interaction, locale);
            }
        });
    }
};