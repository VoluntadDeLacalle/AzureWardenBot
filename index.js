require('dotenv').config(); //initialize dotenv
const Discord = require('discord.js'); //import discord.js
const { MessageEmbed } = require('discord.js');
const axios = require('axios');

var Jimp = require('jimp');
var FormData = require('form-data');
const { DateTime } = require('luxon');

const gistClientInstance = axios.create({
  baseURL: 'https://api.github.com',
  timeout: 10000,
  headers: {
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': 'token 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'
  }
});

const randomWordInstance = axios.create({
  baseURL: 'https://random-word-form.herokuapp.com',
  timeout: 10000
});

function containsSpecialChars(str) {
  const specialChars = /[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
  return specialChars.test(str);
}

function containsSpecialDiscordChars(str) {
  const specialChars = /[*_`|>\\~]/;
  return specialChars.test(str);
}

function containsNumericalChars(str) {
  const specialChars = /[0123456789]/;
  return specialChars.test(str);
}

function GetParsedString(guildID, str) {
  let tempString = ''; finalString = ``;

  for(let i = 0; i < str.length; i++) {
    if(str[i] == '<'){
      if(i + 2 < str.length){
        if(str[i+1] == '@') {
          let currentMentionedID = '', isID = false, mentionEndNumb = i;
          for(let j = i+2; j < str.length;) {
            if(str[j] == '>'){
              mentionEndNumb = j;
              isID = true;
              break;
            }

            currentMentionedID += str[j];
          }
          if(isID) {
            tempString += client.guilds.cache.get(guildID).members.cache(parseInt(currentMentionedID)).displayName;
            i = mentionEndNumb;
            continue;
          }
        }
      }
    }

    tempString += str[i];
  }

  for (let k = 0; k < tempString.length; k++) {
    if (!containsSpecialDiscordChars(str[k])) {
      finalString += str[k];
    }
  }

  return finalString.replace(/\s+/g, ' ').trim();
}

function GetDefaultGuildObj() {
  const guildObj = {
    keywordChar: defaultKeywordChar,
    violationsTimeout: defaultTimeoutLength,
    members: {}
  };

  return guildObj;
}

function GetDefaultMemberObj() {
  const memberObj = {
    offenses: 0,
    charges: {},
    timeoutEnd: '',
    temp_channelID: '',
    temp_msgID: '',
    temp_charge: ''
  };

  return memberObj;
}

function GetUpdatedMemberObj(nOffenses = 0, nCharges = {}, nTimeoutEnd = '', nTemp_channelID = '', nTemp_msgID = '', nTemp_charge = '') {
  const memberObj = {
    offenses: nOffenses,
    charges: nCharges,
    timeoutEnd: nTimeoutEnd,
    temp_channelID: nTemp_channelID,
    temp_msgID: nTemp_msgID,
    temp_charge: nTemp_charge
  };

  return memberObj;
}

async function ShouldAddTimeout(guild, memberID) {
  const savedData = await getSavedData(guild.id, memberID);
  if (savedData[guild.id].members[memberID].timeoutEnd == '') {
    return false;
  }
  else {
    const timeDifferenceIsNaN = isNaN(DateTime.now().setZone('America/Chicago').until(DateTime.fromISO(savedData[guild.id].members[memberID].timeoutEnd)).count('seconds'));
    if (timeDifferenceIsNaN) {
      if (savedData[guild.id].members[memberID].temp_msgID != '') {
        const currentMessage = await client.guilds.cache.get(guild.id).channels.cache.get(savedData[guild.id].members[memberID].temp_channelID).messages.fetch(savedData[guild.id].members[memberID].temp_msgID);
        const innocentReaction = await currentMessage.reactions.resolve(innocentReactEmoji);
        const innocentReactionUsers = await innocentReaction.users.fetch();

        const guiltyReaction = await currentMessage.reactions.resolve(guiltyReactEmoji);
        const guiltyReactionUsers = await guiltyReaction.users.fetch();

        innocentReactionUsers.forEach(user => {
          if (user == guiltyReactionUsers.get(user.id) && user.id != client.user.id) {
            guiltyReaction.users.remove(user);
          }
        });

        await EndViolationVote(guild.id, memberID);
      }
      else {
        await NoResponseCheck(guild.id, memberID);
      }

      return false;
    }
    else {
      return true;
    }
  }
}

async function GetTimeoutObj(guild, memberID, functionName, timeToWaitInMilliseconds) {
  const timeoutObj = setTimeout(
    await functionName,
    timeToWaitInMilliseconds,
    guild.id,
    memberID
  );

  return timeoutObj;
}

function GetMinuteInMilli(minuteTime) {
  return minuteTime * 1000 * 60;
}

function GetSecondInMilli(secondTime) {
  return secondTime * 1000;
}

async function NoResponseCheck(guildID, mentionedMemberID) {
  const savedData = await getSavedData(guildID, mentionedMemberID);
  client.guilds.cache.get(guildID).channels.cache.get(savedData[guildID].members[mentionedMemberID].temp_channelID).send(`<@${mentionedMemberID}> has not responded! A trial has begun!`);
  const guildMember = client.guilds.cache.get(guildID).members.cache.get(mentionedMemberID);

  const respondTime = DateTime.now().setZone('America/Chicago').plus({ minutes: savedData[guildID].violationsTimeout }).setLocale('en-US').toLocaleString(DateTime.DATETIME_SHORT_WITH_SECONDS);
  const voteMessage = await client.guilds.cache.get(guildID).channels.cache.get(savedData[guildID].members[mentionedMemberID].temp_channelID).send(`Hello everyone! ${guildMember.displayName} has been charged with: **"${savedData[guildID].members[mentionedMemberID].temp_charge}"**.\nPlease react to this message to determine if the user is either ${innocentReactEmoji} Innocent or ${guiltyReactEmoji} Guilty!\nVoting will close at ${respondTime} US-CST.`);
  await voteMessage.react(innocentReactEmoji);
  await voteMessage.react(guiltyReactEmoji);

  clearTimeout(timeoutStorage[guildID].members[mentionedMemberID]);
  delete timeoutStorage[guildID].members[mentionedMemberID];

  savedData[guildID].members[mentionedMemberID] = GetUpdatedMemberObj(
    savedData[guildID].members[mentionedMemberID].offenses,
    savedData[guildID].members[mentionedMemberID].charges,
    DateTime.now().setZone('America/Chicago').plus({ minutes: savedData[guildID].violationsTimeout }).toISO(),
    savedData[guildID].members[mentionedMemberID].temp_channelID,
    voteMessage.id,
    savedData[guildID].members[mentionedMemberID].temp_charge);

  if (!(timeoutStorage.hasOwnProperty(guildID))) {
    timeoutStorage[guildID] = GetDefaultGuildObj();
  }
  timeoutStorage[guildID].members[mentionedMemberID] = await GetTimeoutObj(client.guilds.cache.get(guildID), mentionedMemberID, EndViolationVote, GetMinuteInMilli(savedData[guildID].violationsTimeout));

  StartNewReactionCollector(guildID,
    savedData[guildID].members[mentionedMemberID].temp_channelID,
    savedData[guildID].members[mentionedMemberID].temp_msgID,
    GetMinuteInMilli(savedData[guildID].violationsTimeout));

  await updateSavedData(savedData);
}

async function EndViolationVote(guildID, mentionedMemberID) {
  let savedData = await getSavedData();
  const currentMessage = await client.guilds.cache.get(guildID).channels.cache.get(savedData[guildID].members[mentionedMemberID].temp_channelID).messages.fetch(savedData[guildID].members[mentionedMemberID].temp_msgID);
  let innocentReactionCount;
  let guiltyReactionCount;

  currentMessage.reactions.cache.forEach(reaction => {
    if (reaction.emoji.name == innocentReactEmoji) {
      innocentReactionCount = reaction.count;
    }
    else if (reaction.emoji.name == guiltyReactEmoji) {
      guiltyReactionCount = reaction.count;
    }
  });

  if (innocentReactionCount > guiltyReactionCount || innocentReactionCount == guiltyReactionCount) {
    let messageToSend = `<@${mentionedMemberID}> has been found innocent!`
    if (innocentReactionCount == guiltyReactionCount) {
      messageToSend = 'Due to a tie, ' + messageToSend;
    }

    client.guilds.cache.get(guildID).channels.cache.get(savedData[guildID].members[mentionedMemberID].temp_channelID).send(messageToSend);
  }
  else if (guiltyReactionCount > innocentReactionCount) {
    const messageToSend = `<@${mentionedMemberID}> has been found guilty and is convicted of **\"${savedData[guildID].members[mentionedMemberID].temp_charge}\"**!`;
    await AddViolation(guildID, mentionedMemberID, savedData[guildID].members[mentionedMemberID].temp_charge);
    savedData = await getSavedData();

    client.guilds.cache.get(guildID).channels.cache.get(savedData[guildID].members[mentionedMemberID].temp_channelID).send(messageToSend);
  }

  clearTimeout(timeoutStorage[guildID].members[mentionedMemberID]);
  delete timeoutStorage[guildID].members[mentionedMemberID];

  savedData[guildID].members[mentionedMemberID] = GetUpdatedMemberObj(
    savedData[guildID].members[mentionedMemberID].offenses,
    savedData[guildID].members[mentionedMemberID].charges);

  console.log("Vote has ended");
  await updateSavedData(savedData);
}

function StartNewReactionCollector(guildID, channelID, msgID, timeInMilliseconds) {
  const filter = (reaction) => {
    return reaction.emoji.name === guiltyReactEmoji || reaction.emoji.name === innocentReactEmoji;
  };
  const currentMessage = client.guilds.cache.get(guildID).channels.cache.get(channelID).messages.cache.get(msgID);
  const collector = currentMessage.createReactionCollector({ filter, time: timeInMilliseconds });

  collector.on('collect', (reaction, user) => {

    currentMessage.reactions.cache.forEach(currentReaction => {
      if (currentReaction != reaction) {
        const currentUser = currentReaction.users.cache.get(user.id);
        if (currentUser != null && currentUser.id != currentMessage.author.id) {
          currentReaction.users.remove(user);
        }
      }
    });
  });
}

async function MergeAvatarImages(guildMember, hasOffenses) {
  let displayURL = guildMember.user.displayAvatarURL({ format: 'png' });
  console.log(displayURL);

  if (displayURL[27] == 'e') {
    displayURL = 'defaultPrisoner.png';
  }

  let b4Str;
  if (hasOffenses) {
    const userImage = await Jimp.read(displayURL);
    await userImage.resize(512, 512, Jimp.RESIZE_BICUBIC);
    const prisonBars = await Jimp.read('prisonBars.png');
    await prisonBars.resize(512, 512, Jimp.RESIZE_BICUBIC);
    userImage.blit(prisonBars, 0, 0);

    b4Str = await userImage.getBase64Async(userImage.getMIME());
  }
  else {
    const userImage = await Jimp.read(displayURL);
    await userImage.resize(512, 512, Jimp.RESIZE_BICUBIC);

    b4Str = await userImage.getBase64Async(userImage.getMIME());
  }


  const data = b4Str.split(',')[1];
  const buf = new Buffer.from(data, 'base64');
  const file = new Discord.MessageAttachment(buf, 'img.png');

  return file;
}

async function GetUpscaledImage(imageLink) {
  const bodyFormData = new FormData();
  bodyFormData.append('image', imageLink);

  const response = await axios({
    method: "post",
    url: "https://api.deepai.org/api/torch-srgan",
    data: bodyFormData,
    headers: {
      "Content-Type": "multipart/form-data",
      "api-key": "0fc1b413-9e9d-4612-b86b-e7b7edd0c778"
    },
  });

  return response.data.output_url;
}

async function GetRandomAdjective() {
  try {
    const response = await randomWordInstance.get('random/adjective');
    const responseContent = response.data;

    return responseContent[0].charAt(0).toUpperCase() + responseContent[0].slice(1);
  } catch (error) {
    console.error(error);
  }
}

async function getSavedData(guildID, memberID = null) {
  try {
    const response = await gistClientInstance.get('gists/819fe5eabe9724b2a3d47f6ef8497236');
    const responseContent = JSON.parse(response.data.files["AzureWardenData.json"].content);

    if (!(responseContent.hasOwnProperty(guildID))) {
      responseContent[guildID] = GetDefaultGuildObj();
      await updateSavedData(responseContent);
    }

    if (memberID != null) {
      if (!(responseContent[guildID].members.hasOwnProperty(memberID))) {
        responseContent[guildID].members[memberID] = GetDefaultMemberObj();
        await updateSavedData(responseContent);
      }
    }

    return responseContent;
  } catch (error) {
    console.error(error);
  }
}

async function updateSavedData(newData) {
  try {
    const response = await gistClientInstance.patch('gists/819fe5eabe9724b2a3d47f6ef8497236', {
      files: {
        "AzureWardenData.json": {
          "filename": "AzureWardenData.json",
          "content": JSON.stringify(newData),
        }
      }
    });

    //console.log(JSON.parse(response.data.files["AzureWardenData.json"].content));
  } catch (error) {
    console.error(error);
  }
}

const client = new Discord.Client({ intents: ['GUILDS', 'GUILD_MESSAGES', 'GUILD_MESSAGE_REACTIONS', 'GUILD_MEMBERS'] }); //create new client

const defaultKeywordChar = '&';
const chargeMaxLength = 64;
const maxEmbedChargePerLine = 3;

const defaultTimeoutLength = 2;
const lowerTimeoutLength = 1;
const upperTimeoutLength = 5;

const guiltyReactEmoji = '🇬';
const innocentReactEmoji = '🇮';

var timeoutStorage = {};

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity(`Type: \"${defaultKeywordChar}help\" for info!`, { type: 'PLAYING' });

  const currentGuilds = await client.guilds.fetch();
  currentGuilds.forEach(async fetchedGuild => {
    const currentGuild = client.guilds.cache.get(fetchedGuild.id);
    const currentMembers = await currentGuild.members.fetch();
    const savedData = await getSavedData(fetchedGuild.id);
    timeoutStorage[fetchedGuild.id] = GetDefaultGuildObj();

    currentMembers.forEach(async member => {
      if (!(savedData[fetchedGuild.id].members.hasOwnProperty(member.id))) {
        savedData[fetchedGuild.id].members[member.id] = GetDefaultMemberObj();
        await updateSavedData(savedData);
      }

      if (await ShouldAddTimeout(currentGuild, member.id)) {
        const endTime = DateTime.now().setZone('America/Chicago').until(DateTime.fromISO(savedData[fetchedGuild.id].members[member.id].timeoutEnd)).count('seconds');

        if (isNaN(endTime)) {
          if (savedData[fetchedGuild.id].members[member.id].temp_msgID != '') {
            await EndViolationVote(guild.id, memberID);
          }
          else {
            await NoResponseCheck(guild.id, memberID);
          }
        }
        else {
          let functionToCall;

          if (savedData[fetchedGuild.id].members[member.id].temp_msgID != '') {
            const currentMessage = await client.guilds.cache.get(fetchedGuild.id).channels.cache.get(savedData[fetchedGuild.id].members[member.id].temp_channelID).messages.fetch(savedData[fetchedGuild.id].members[member.id].temp_msgID);
            const innocentReaction = await currentMessage.reactions.resolve(innocentReactEmoji);
            const innocentReactionUsers = await innocentReaction.users.fetch();

            const guiltyReaction = await currentMessage.reactions.resolve(guiltyReactEmoji);
            const guiltyReactionUsers = await guiltyReaction.users.fetch();

            innocentReactionUsers.forEach(user => {
              if (user == guiltyReactionUsers.get(user.id) && user.id != client.user.id) {
                guiltyReaction.users.remove(user);
              }
            });

            StartNewReactionCollector(fetchedGuild.id, savedData[fetchedGuild.id].members[member.id].temp_channelID, savedData[fetchedGuild.id].members[member.id].temp_msgID, (GetSecondInMilli(endTime)));
            functionToCall = EndViolationVote;
          }
          else {
            functionToCall = NoResponseCheck;
          }

          timeoutStorage[fetchedGuild.id].members[member.id] = await GetTimeoutObj(currentGuild, member.id, functionToCall, (GetSecondInMilli(endTime)));
        }
      }
    });
  });
});

client.on('guildCreate', async guild => {
  const savedData = await getSavedData(guild.id);
  const currentGuildID = guild.id;

  if (!(savedData.hasOwnProperty(currentGuildID))) {
    console.log('Guild not recognized, updating all members.');
    savedData[currentGuildID] = GetDefaultGuildObj();

    const currentMembers = await guild.members.fetch();
    currentMembers.forEach(member => {
      if (!(savedData[currentGuildID].members.hasOwnProperty(member.id))) {
        savedData[currentGuildID].members[member.id] = GetDefaultMemberObj();
      }
    });
  }
  else {
    const currentMembers = await guild.members.fetch();
    currentMembers.forEach(member => {
      if (!(savedData[currentGuildID].members.hasOwnProperty(member.id))) {
        savedData[currentGuildID].members[member.id] = GetDefaultMemberObj();
      }
    });
  }

  await updateSavedData(savedData);
  console.log('Guild joined.');
  if(guild.systemChannel != null) {
    guild.systemChannel.send(`Thank you for inviting me! Use \"${savedData[currentGuildID].keywordChar}help\" to display my commands!`);
  }
});

async function CreateHelpMessage(guildID) {
  const savedData = await getSavedData(guildID);
  const currentKeyword = savedData[guildID].keywordChar;
  const currentDuration = savedData[guildID].violationsTimeout;


  const helpEmbed = new MessageEmbed()
    .setTitle('Azure Warden™️ Help List')
    .addFields(
      {
        name: `\u200B`,
        value: `**\\~\\~\\~Utility Commands\\~\\~\\~**`
      },
      {
        name: `${currentKeyword}help`,
        value: 'Displays the list you\'re currently reading!\u200B'
      },
      {
        name: `${currentKeyword}change_keyword <char> __ADMIN ONLY__`,
        value: `Changes the preceding character for commands! New keyword should only be one special character and typed between single quotes.\nExample: *${currentKeyword}change_keyword \'$\'*\n**>**The server\'s current keyword is ${currentKeyword}.\u200B`
      },
      {
        name: `${currentKeyword}change_action_duration <[${lowerTimeoutLength}-${upperTimeoutLength}]> __ADMIN ONLY__`,
        value: `Changes the time allotted for actions such as plaintiff pleading and voting. The new duration should be a number typed between single quotes and within a range of ${lowerTimeoutLength}-${upperTimeoutLength}.\nExample: *${currentKeyword}change_action_duration \'2\'*\n**>**The server's current duration is ${currentDuration} minute${currentDuration == 1 ? '' : 's'}.\u200B`
      },
      {
        name: `\u200B`,
        value: `**\\~\\~\\~Violation and View Commands\\~\\~\\~**`
      },
      {
        name: `${currentKeyword}violation <user> <charge>`,
        value: `Prompts the mentioned user to plead either innocent or guilty to charge placed upon them. Pleading **${currentKeyword}innocent** will start a vote, which means it is up to the user\'s peers to decide their fate. Pleading **${currentKeyword}guilty** will convict the user of the charge.\nThe charge placed upon the user can be no longer than **${chargeMaxLength}** characters in length.\u200B`
      },
      {
        name: `${currentKeyword}view_offenses <user>`,
        value: 'Will display the user\'s current offense count.\u200B'
      },
      {
        name: `${currentKeyword}view_charges <user>`,
        value: 'Will display the user\'s current list of charges.\u200B'
      },
      {
        name: `${currentKeyword}view_jailcard <user>`,
        value: 'Will display the user\'s jailcard, a formatted message of all their jailed information.\u200B'
      },
      {
        name: `${currentKeyword}top_offenders`,
        value: 'Will display the server\'s top offenders, in an ordered list, capping off at five users.\u200B'
      },
      {
        name: `\u200B`,
        value: `**\\~\\~\\~Removal and Cancellation Commands\\~\\~\\~**`
      },
      {
        name: `${currentKeyword}cancel_violation <user> __ADMIN ONLY__`,
        value: 'Will cancel the ongoing violation trial for the specified user in either the pleading or voting phase.\u200B'
      },
      {
        name: `${currentKeyword}remove_violation <user> <charge> <count?> __ADMIN ONLY__`,
        value: `Will remove a violation specified by the charge. The charge must be typed between single quotes.\nThe count parameter is optional. If a count is specified, then that many counts of the charge will be removed; otherwise the count will be **one** and only **one** instance of the charge will be removed.\nExample: ${currentKeyword}remove_violation @AzureWarden \'Bot Broken\' 2\u200B`
      },
      {
        name: `${currentKeyword}remove_all_violations <user> __ADMIN ONLY__`,
        value: 'Will remove all violations for the specified user.\u200B'
      },
      {
        name: `${currentKeyword}remove_server_violations __ADMIN ONLY__`,
        value: 'Will remove all violations for every user in the current server.\u200B'
      },
    );

  return helpEmbed;
}

async function CreateJailcard(guildID, memberID, currentGuildMember) {
  const savedData = await getSavedData(guildID, memberID);
  const memberObj = savedData[guildID].members[memberID];

  const randomAdjective = await GetRandomAdjective();

  let hasOffenses = savedData[guildID].members[memberID].offenses > 0 ? true : false;
  const avatarImageFile = await MergeAvatarImages(currentGuildMember, hasOffenses);

  const jailcardEmbed = {
    color: 'RED',
    title: currentGuildMember.displayName,
    thumbnail: {
      url: 'attachment://img.png',
    },
    fields: [
      {
        name: `\u200B`,
        value: `\u200B`
      },
      {
        name: `Current Number of Offenses:`,
        value: `${currentGuildMember.displayName} has committed **${memberObj.offenses}** offense${memberObj.offenses == 1 ? '' : 's'}.\n\u200B`
      },
      {
        name: `Current Charges of the Accused:`,
        value: `${Object.keys(memberObj.charges).length == 0 ? `${currentGuildMember.displayName} currently has no charges.\u200B` : `${currentGuildMember.displayName} has been found guilty of the following:\n\u200B`}`
      },
    ],
  };
  jailcardEmbed.description = hasOffenses > 0 ? `*${randomAdjective} Offender*` : `*Innocent*`;
  const finalEmbed = new MessageEmbed(jailcardEmbed);

  if (Object.keys(memberObj.charges).length > 0) {
    let chargeCount = 0;
    for (const [key, value] of Object.entries(memberObj.charges)) {
      finalEmbed.addField(`•  ${value} count${value == 1 ? '' : 's'} of ${key}`, '\u200B', !(chargeCount == maxEmbedChargePerLine));
      chargeCount++;
      if (chargeCount == maxEmbedChargePerLine) {
        chargeCount = 0;
      }
    }

    if (chargeCount > 0) {
      for (let i = chargeCount; i < maxEmbedChargePerLine; i++) {
        finalEmbed.addField('\u200B', '\u200B', true);
      }
    }
  }

  return { embeds: [finalEmbed], files: [avatarImageFile] };
}

async function SetMessageReactions(msg, reactionArray) {
  for(let i = 0; i < reactionArray.length; i++) {
    await msg.react(reactionArray[i]);
  }
}

async function AddViolation(guildID, memberID, charge) {

  const savedData = await getSavedData(guildID, memberID);
  savedData[guildID].members[memberID].offenses = savedData[guildID].members[memberID].offenses + 1;

  if (charge in savedData[guildID].members[memberID].charges) {
    savedData[guildID].members[memberID].charges[charge]++;
  }
  else {
    savedData[guildID].members[memberID].charges[charge] = 1;
  }

  await updateSavedData(savedData);
}

async function ChangeKeyword(guildID, newKeywordChar) {
  const savedData = await getSavedData(guildID);
  savedData[guildID].keywordChar = newKeywordChar;
  await updateSavedData(savedData);
}

async function GetOffenses(guildID, memberID) {
  const savedData = await getSavedData(guildID, memberID);
  return savedData[guildID].members[memberID].offenses;
}

async function GetCharges(guildID, memberID) {
  const savedData = await getSavedData(guildID, memberID);
  return savedData[guildID].members[memberID].charges;
}

async function ResetMemberViolations(guildID, memberID) {
  const savedData = await getSavedData(guildID, memberID);
  savedData[guildID].members[memberID] = GetDefaultMemberObj();
  await updateSavedData(savedData);
}

async function ResetGuildViolations(guild) {
  const savedData = await getSavedData(guild.id);

  const currentMembers = await guild.members.fetch();
  currentMembers.forEach(member => {
    savedData[guild.id].members[member.id] = GetDefaultMemberObj();
  });

  await updateSavedData(savedData);
}

async function HandleBasicCommands(savedData, command, msg, messageContentSplit) {

  let guildID = msg.guild.id;
  let authorID = msg.author.id;
  let authorGuildMember = msg.guild.members.cache.get(authorID);
  let mentionedMemberID = msg.mentions.users.keys().next().value;
  let guildMember = msg.guild.members.cache.get(mentionedMemberID);
  switch (command) {
    case 'help': //Display help command list.
      const modifiedHelpEmbed = await CreateHelpMessage(guildID);
      msg.reply({ embeds: [modifiedHelpEmbed] });
      break;
    case 'change_keyword': //Change the keyword for commands
      if (!authorGuildMember.permissions.has('ADMINISTRATOR')) {
        msg.reply('You do not have admin permissions and cannot call this command.');
        break;
      }

      let newKeywordChar = messageContentSplit[1];
      if (newKeywordChar == null) {
        msg.reply('Error: User must enter a value for the new keyword. Please try again.');
        break;
      }

      if (!((newKeywordChar[0] == '\'') && (newKeywordChar[2] == '\''))) {
        msg.reply('Error: Syntax not matching. Please try again.');
        break;
      }

      newKeywordChar = newKeywordChar[1];
      if (!containsSpecialChars(newKeywordChar)) {
        msg.reply('Error: New keyword must be a special character. Please try again.');
        break;
      }

      await ChangeKeyword(guildID, newKeywordChar);
      msg.reply(`The new keyword has been set to **${newKeywordChar}**.`);
      break;
    case 'change_action_duration': //Changes the duration for timeout events
      if (!authorGuildMember.permissions.has('ADMINISTRATOR')) {
        msg.reply('You do not have admin permissions and cannot call this command.');
        break;
      }

      let newDurationNumber = messageContentSplit[1];
      if (newDurationNumber == null) {
        msg.reply('Error: User must enter a value for the new duration. Please try again.');
        break;
      }

      if (!((newDurationNumber[0] == '\'') && (newDurationNumber[2] == '\''))) {
        msg.reply('Error: Syntax not matching or tried to use a non-whole number. Please try again.');
        break;
      }

      newDurationNumber = newDurationNumber[1];
      let finalNumber = parseInt(newDurationNumber);
      if (isNaN(finalNumber)) {
        msg.reply('Error: New duration must be a number. Please try again.');
        break;
      }

      if (!((finalNumber) >= lowerTimeoutLength && (finalNumber <= upperTimeoutLength))) {
        msg.reply(`Error: New duration must be a between ${lowerTimeoutLength} and ${upperTimeoutLength}. Please try again.`);
        break;
      }

      finalNumber = Math.floor(finalNumber);
      savedData[guildID].violationsTimeout = finalNumber;
      await updateSavedData(savedData);
      msg.reply(`The new duration has been set to **${finalNumber}** minute${finalNumber == 1 ? '' : 's'}.`);
      break;
    case 'violation': //Creates a violation and adds an offense and the charge to the user's record
      if (msg.mentions.users.size == 0) {
        msg.reply('Error: No user mentioned. Please try again.');
        break;
      }
      savedData = await getSavedData(guildID, mentionedMemberID);

      const substringStart = msg.content.indexOf('>') + 2;
      if (substringStart == msg.content.length || substringStart == msg.content.length + 1) {
        msg.reply('Error: No charge has been filed. Please try again.');
        break;
      }

      if ((msg.content.length - substringStart) > chargeMaxLength) {
        msg.reply(`Error: Charge length exceeds ${chargeMaxLength} characters. Please try again.`);
        break;
      }

      let charge = GetParsedString(guildID, msg.content.substring(substringStart, substringStart + (msg.content.length - substringStart))).toUpperCase();
      if (savedData[guildID].members[mentionedMemberID].timeoutEnd == '' && savedData[guildID].members[mentionedMemberID].temp_msgID == '') {
        savedData[guildID].members[mentionedMemberID] = GetUpdatedMemberObj(
          savedData[guildID].members[mentionedMemberID].offenses,
          savedData[guildID].members[mentionedMemberID].charges,
          DateTime.now().setZone('America/Chicago').plus({ minutes: savedData[guildID].violationsTimeout }).toISO(),
          msg.channel.id,
          '',
          charge);

        if (!(timeoutStorage.hasOwnProperty(guildID))) {
          timeoutStorage[guildID] = GetDefaultGuildObj();
        }

        timeoutStorage[guildID].members[mentionedMemberID] = await GetTimeoutObj(msg.guild, mentionedMemberID, NoResponseCheck, GetMinuteInMilli(savedData[guildID].violationsTimeout));

        const respondTime = DateTime.now().setZone('America/Chicago').plus({ minutes: savedData[guildID].violationsTimeout }).setLocale('en-US').toLocaleString(DateTime.DATETIME_SHORT_WITH_SECONDS);
        msg.channel.send(`<@${mentionedMemberID}>, you have been charged with **\"${charge}\"**. How do you plea?\nRespond with ${savedData[guildID].keywordChar}guilty or ${savedData[guildID].keywordChar}innocent by ${respondTime} US-CST or be put to trial.`);
      }
      else {
        msg.reply(`Please wait. One trial, per user, at a time.`);
        break;
      }

      await updateSavedData(savedData);
      break;
    case 'guilty': //Allows user to plead guilty to a violation
      savedData = await getSavedData(guildID, authorID);
      if (savedData[guildID].members[authorID].timeoutEnd != '' && savedData[guildID].members[authorID].temp_msgID == '') {
        await AddViolation(guildID, authorID, savedData[guildID].members[authorID].temp_charge);
        savedData = await getSavedData(guildID, authorID);
        msg.channel.send(`<@${authorID}> has pleaded guilty and been convicted of **\"${savedData[guildID].members[authorID].temp_charge}\"**.`);

        clearTimeout(timeoutStorage[guildID].members[authorID]);
        delete timeoutStorage[guildID].members[authorID];

        const currentOffenses = savedData[guildID].members[authorID].offenses;
        const currentCharges = savedData[guildID].members[authorID].charges;
        savedData[guildID].members[authorID] = GetUpdatedMemberObj(currentOffenses, currentCharges);
        await updateSavedData(savedData);
      }
      break;
    case 'innocent': //Allows user to plead innocent to a violation
      savedData = await getSavedData(guildID, authorID);
      if (savedData[guildID].members[authorID].timeoutEnd != '' && savedData[guildID].members[authorID].temp_msgID == '') {
        msg.channel.send(`<@${authorID}> has pleaded innocent! A trial has begun!`);

        clearTimeout(timeoutStorage[guildID].members[authorID]);
        delete timeoutStorage[guildID].members[authorID];

        const authorGuildMember = msg.guild.members.cache.get(authorID);
        const respondTime = DateTime.now().setZone('America/Chicago').plus({ minutes: savedData[guildID].violationsTimeout }).setLocale('en-US').toLocaleString(DateTime.DATETIME_SHORT_WITH_SECONDS);
        const voteMessage = await msg.channel.send(`Hello everyone! ${authorGuildMember.displayName} has been charged with: **"${savedData[guildID].members[authorID].temp_charge}"**.\nPlease react to this message to determine if the user is either ${innocentReactEmoji} Innocent or ${guiltyReactEmoji} Guilty!\nVoting will close at ${respondTime} US-CST.`);
        await voteMessage.react(innocentReactEmoji);
        await voteMessage.react(guiltyReactEmoji);

        savedData[guildID].members[authorID] = GetUpdatedMemberObj(
          savedData[guildID].members[authorID].offenses,
          savedData[guildID].members[authorID].charges,
          DateTime.now().setZone('America/Chicago').plus({ minutes: savedData[guildID].violationsTimeout }).toISO(),
          savedData[guildID].members[authorID].temp_channelID,
          voteMessage.id,
          savedData[guildID].members[authorID].temp_charge);

        if (!(timeoutStorage.hasOwnProperty(guildID))) {
          timeoutStorage[guildID] = GetDefaultGuildObj();
        }
        timeoutStorage[guildID].members[authorID] = await GetTimeoutObj(msg.guild, authorID, EndViolationVote, GetMinuteInMilli(savedData[guildID].violationsTimeout));

        StartNewReactionCollector(guildID,
          savedData[guildID].members[authorID].temp_channelID,
          savedData[guildID].members[authorID].temp_msgID,
          GetMinuteInMilli(savedData[guildID].violationsTimeout));

        await updateSavedData(savedData);
      }
      break;
    case 'view_offenses': //Displays user's number of offenses
      if (msg.mentions.users.size == 0) {
        msg.reply('Error: No user mentioned. Please try again.');
        break;
      }
      savedData = await getSavedData(guildID, mentionedMemberID);

      const memberOffenses = await GetOffenses(guildID, mentionedMemberID);

      const offenseEmbed = new MessageEmbed()
        .setTitle(`${guildMember.displayName} has committed **${memberOffenses}** offense${memberOffenses == 1 ? '' : 's'}.`);

      const viewOffensesMessage = await msg.reply({ embeds: [offenseEmbed] });

      switch(savedData[guildID].members[mentionedMemberID].offenses) {
        case 42: 
          await SetMessageReactions(viewOffensesMessage, ['🌌']);
        break;
        case 69:
          await SetMessageReactions(viewOffensesMessage, ['🇳', '🇮', '🇨', '🇪']);
        break;
        case 100: 
          await SetMessageReactions(viewOffensesMessage, ['💯']);
        break;
        case 101: 
          await SetMessageReactions(viewOffensesMessage, ['🤣', '🇭', '🇦']);
        break;
        case 420:
         await SetMessageReactions(viewOffensesMessage, ['☘️', '🔥']);
        break;
        case 666: 
          await SetMessageReactions(viewOffensesMessage, ['😈']);
        break;
        case 800:
          await SetMessageReactions(viewOffensesMessage, ['👻']);
        break;
        case 911: 
          await SetMessageReactions(viewOffensesMessage, ['🚑️', '🚒', '🚓']);
        break;
        case 1337: 
          await SetMessageReactions(viewOffensesMessage, ['😎', '🎮️', '💯']);
        break;
        case 80085: 
          await SetMessageReactions(viewOffensesMessage, ['👀']);
        break;
      }
      break;
    case 'view_charges': //Displays user's current charges
      if (msg.mentions.users.size == 0) {
        msg.reply('Error: No user mentioned. Please try again.');
        break;
      }

      const memberCharges = await GetCharges(guildID, mentionedMemberID);
      const chargesEmbed = new MessageEmbed().setTitle(`${Object.keys(memberCharges).length == 0 ? `${guildMember.displayName} currently has no charges.\u200B` : `${guildMember.displayName} has been found guilty of the following:\n\u200B`}`);
      if (Object.keys(memberCharges).length > 0) {
        let chargeCount = 0;
        for (const [key, value] of Object.entries(memberCharges)) {
          chargesEmbed.addField(`•  ${value} count${value == 1 ? '' : 's'} of ${key}`, '\u200B', !(chargeCount == maxEmbedChargePerLine));
          chargeCount++;
          if (chargeCount == maxEmbedChargePerLine) {
            chargeCount = 0;
          }
        }

        if (chargeCount > 0) {
          for (let i = chargeCount; i < maxEmbedChargePerLine; i++) {
            chargesEmbed.addField('\u200B', '\u200B', true);
          }
        }
      }

      msg.reply({ embeds: [chargesEmbed] });
      break;
    case 'view_jailcard': //Displays user's jailcard
      if (msg.mentions.users.size == 0) {
        msg.reply('Error: No user mentioned. Please try again.');
        break;
      }
      savedData = await getSavedData(guildID, mentionedMemberID);

      const jailcardMessage = await CreateJailcard(guildID, mentionedMemberID, guildMember);
      msg.reply(jailcardMessage);
      break;
    case 'top_offenders': //Displays a list of the top offenders, capping off at 5
      savedData = await getSavedData(guildID, mentionedMemberID);
      const topOffenderIDs = [];
      let noOffendersLeft = false;

      while (topOffenderIDs.length < 5 && !noOffendersLeft) {
        let maxOffenses = 0;
        let maxOffensesID = '';
        for (const [key, value] of Object.entries(savedData[guildID].members)) {
          if (topOffenderIDs.length > 0) {
            if (topOffenderIDs.includes(key)) {
              continue;
            }
          }
          if (value.offenses > maxOffenses) {
            maxOffenses = value.offenses;
            maxOffensesID = key;
          }
        }

        if (maxOffenses > 0) {
          topOffenderIDs.push(maxOffensesID);
        }
        else {
          noOffendersLeft = true;
        }
      }

      const topOffenderEmbeds = [];
      const maxTopOffenderIDs = topOffenderIDs.length;
      for (let i = 0; i < maxTopOffenderIDs; i++) {
        const currentID = topOffenderIDs.shift();
        const currentGuildMember = msg.guild.members.cache.get(currentID);
        const currentEmbed = new MessageEmbed()
          .setAuthor({ name: `${i + 1}. ${currentGuildMember.displayName} with ${savedData[guildID].members[currentID].offenses} offense${savedData[guildID].members[currentID].offenses == 1 ? '' : 's'}.`, iconURL: currentGuildMember.displayAvatarURL() });
        topOffenderEmbeds.push(currentEmbed);
      }

      msg.reply({ embeds: topOffenderEmbeds });
      break;
    case 'cancel_violation': //Cancels the violation process against a user
      if (!authorGuildMember.permissions.has('ADMINISTRATOR')) {
        msg.reply('You do not have admin permissions and cannot call this command.');
        break;
      }
      if (msg.mentions.users.size == 0) {
        msg.reply('Error: No user mentioned. Please try again.');
        break;
      }
      savedData = await getSavedData(guildID, mentionedMemberID);

      if (savedData[guildID].members[mentionedMemberID].temp_channelID != '') {
        clearTimeout(timeoutStorage[guildID].members[mentionedMemberID]);
        delete timeoutStorage[guildID].members[mentionedMemberID];

        savedData[guildID].members[mentionedMemberID] = GetUpdatedMemberObj(
          savedData[guildID].members[mentionedMemberID].offenses,
          savedData[guildID].members[mentionedMemberID].charges
        );
      }
      else {
        msg.reply('Error: User has no ongoing violation trial to cancel.')
        break;
      }

      await updateSavedData(savedData);
      msg.reply(`${guildMember.displayName}'s ongoing violation trial has been cancelled.`);
      break;
    case 'remove_violation': //Removes a certain violation against a user, can specify how many of the same violation to remove
      if (!authorGuildMember.permissions.has('ADMINISTRATOR')) {
        msg.reply('You do not have admin permissions and cannot call this command.');
        break;
      }

      if (msg.mentions.users.size == 0) {
        msg.reply('Error: No user mentioned. Please try again.');
        break;
      }
      savedData = await getSavedData(guildID, mentionedMemberID);

      const currentMessage = msg.content;
      let firstQuote = -1, secondQuote = -1;

      for (let i = 0; i < currentMessage.length; i++) {
        if (firstQuote == -1) {
          if (currentMessage[i] == '\'') {
            firstQuote = i;
            continue;
          }
        }
        else if (secondQuote == -1) {
          if (currentMessage[i] == '\'') {
            secondQuote = i;
            break;
          }
        }
      }

      if (!(firstQuote != -1 && secondQuote != -1)) {
        msg.reply('Error: Syntax not matching. Please try again.');
        break;
      }
      const chargeToRemove = currentMessage.substring(firstQuote + 1, secondQuote);
      let numberToRemove = 1;
      let tempNumber = currentMessage.split('\'')[2].split(' ')[1];
      let numberProvided = false;
      if (tempNumber != undefined) {
        tempNumber = tempNumber.trim();
        numberProvided = true;
      }

      if (tempNumber != '' && containsNumericalChars(tempNumber) && tempNumber > 0 && numberProvided) {
        numberToRemove = parseInt(tempNumber);
      }

      if (!(chargeToRemove.toUpperCase() in savedData[guildID].members[mentionedMemberID].charges)) {
        msg.reply(`Error: User has not been convicted of \"${chargeToRemove.toUpperCase()}\".`);
        break;
      }

      numberToRemove = Math.min(numberToRemove, savedData[guildID].members[mentionedMemberID].charges[chargeToRemove.toUpperCase()]);

      if (numberToRemove == savedData[guildID].members[mentionedMemberID].charges[chargeToRemove.toUpperCase()]) {
        delete savedData[guildID].members[mentionedMemberID].charges[chargeToRemove.toUpperCase()];

        msg.reply(`Removed all counts of ${chargeToRemove.toUpperCase()} from ${guildMember.displayName}\'s record.`);
      }
      else {
        savedData[guildID].members[mentionedMemberID].charges[chargeToRemove.toUpperCase()] = savedData[guildID].members[mentionedMemberID].charges[chargeToRemove.toUpperCase()] - numberToRemove;
        msg.reply(`Removed ${numberToRemove} count${numberToRemove == 1 ? '' : 's'} of ${chargeToRemove.toUpperCase()} from ${guildMember.displayName}\'s record.`);
      }
      savedData[guildID].members[mentionedMemberID].offenses = savedData[guildID].members[mentionedMemberID].offenses - numberToRemove;

      await updateSavedData(savedData);
      break;
    case 'remove_all_violations': //Removes all of the violations placed on a specific user
      if (!authorGuildMember.permissions.has('ADMINISTRATOR')) {
        msg.reply('You do not have admin permissions and cannot call this command.');
        break;
      }
      if (msg.mentions.users.size == 0) {
        msg.reply('Error: No user mentioned. Please try again.');
        break;
      }
      savedData = await getSavedData(guildID, mentionedMemberID);

      await ResetMemberViolations(guildID, mentionedMemberID);
      msg.reply(`All of ${guildMember.displayName}'s violations have been removed.`);
      break;
    case 'remove_server_violations': //Removes all violations of all users in the current server
      if (!authorGuildMember.permissions.has('ADMINISTRATOR')) {
        msg.reply('You do not have admin permissions and cannot call this command.');
        break;
      }

      await ResetGuildViolations(msg.guild);
      msg.reply('All member\'s violations have been removed.');
      break;
    // case 'test':
    //   // var testObj = {};
    //   // await updateSavedData(testObj);

    //   break;
  }
}

client.on('messageCreate', async msg => {
  const currentMessage = msg.content;
  const savedData = await getSavedData(msg.guild.id);
  const currentGuildKeyword = savedData[msg.guild.id].keywordChar;
  if (!currentMessage.startsWith(currentGuildKeyword)) {
    if (currentMessage.startsWith(defaultKeywordChar)) {
      const messageContentSplit = msg.content.split(' ');
      const command = messageContentSplit[0].substring(1, messageContentSplit[0].length).toLowerCase();

      if (command == 'help') {
        const modifiedHelpEmbed = await CreateHelpMessage(msg.guild.id);
        msg.reply({ embeds: [modifiedHelpEmbed] });
        return;
      }
    }
    return;
  }

  const messageContentSplit = msg.content.split(' ');
  const command = messageContentSplit[0].substring(1, messageContentSplit[0].length).toLowerCase();

  HandleBasicCommands(savedData, command, msg, messageContentSplit);
});


//make sure this line is the last line
client.login(process.env.CLIENT_TOKEN); //login bot using token